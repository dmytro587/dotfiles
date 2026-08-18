import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compileCommandPolicy } from "./bash-policy.ts";
import { PermissionGate } from "./gate.ts";
import { isMacOptionLInput } from "./shortcuts.ts";
import type { ShieldScanResult, ShieldScanner } from "./shield.ts";
import { nextAutonomyMode, type AuditEvent, type AutonomyMode, type OperationApproval, type PermissionPolicyConfig, type ShieldPlan } from "./types.ts";

class FakeShieldScanner implements ShieldScanner {
	readonly calls: Array<{ plan: ShieldPlan; cwd: string; maxBytes: number }> = [];
	readonly #result: ShieldScanResult;

	constructor(result: ShieldScanResult = { ok: true, reason: "no-sensitive-patterns" }) {
		this.#result = result;
	}

	async scan(plan: ShieldPlan, cwd: string, maxBytes: number) {
		this.calls.push({ plan, cwd, maxBytes });
		return this.#result;
	}
}

function policyFor(options: {
	defaultAutonomy?: AutonomyMode;
	commandAllowlist?: string[];
	commandDenylist?: string[];
	commandBlocklist?: string[];
} = {}): PermissionPolicyConfig {
	return {
		version: 2,
		testedPiVersion: "0.83.0",
		defaultAutonomy: options.defaultAutonomy ?? "off",
		commandAllowlist: options.commandAllowlist ?? [],
		commandDenylist: options.commandDenylist ?? [],
		commandBlocklist: options.commandBlocklist ?? [],
		limits: {
			maxTextFileBytes: 1024,
			maxOperationBytes: 1024,
			maxMediumFilesPerSession: 5,
			maxMediumSnapshotBytesPerSession: 4096,
			maxGitDiffBytes: 1024,
		},
	};
}

async function setup(options: {
	policy?: PermissionPolicyConfig;
	shieldScanner?: ShieldScanner;
} = {}) {
	const root = await mkdtemp(join(tmpdir(), "pi-permission-gate-"));
	const workspace = join(root, "workspace");
	const agentDirectory = join(root, "agent");
	await mkdir(workspace);
	await writeFile(join(workspace, "notes.txt"), "before\n");
	const policy = options.policy ?? policyFor();
	const shieldScanner = options.shieldScanner ?? new FakeShieldScanner();
	const audit: AuditEvent[] = [];
	const gate = new PermissionGate({
		agentDirectory,
		policy,
		commandPolicy: compileCommandPolicy(policy),
		policyRevision: "sha256:test-policy",
		shieldScanner,
		onAudit: (event) => audit.push(event),
	});
	await gate.startSession({ sessionId: "session-1", cwd: workspace });
	return { agentDirectory, audit, gate, shieldScanner, workspace };
}

function approvalUi(approval: OperationApproval, persistMode: (mode: AutonomyMode) => Promise<boolean> = async () => true) {
	return {
		hasUI: true,
		confirm: async () => true,
		approveOperation: async () => approval,
		persistMode,
	};
}

const editInput = { path: "notes.txt", edits: [{ oldText: "before", newText: "after" }] };

test("cycles autonomy from off through high and recognizes Option+L", () => {
	assert.equal(nextAutonomyMode("off"), "low");
	assert.equal(nextAutonomyMode("low"), "medium");
	assert.equal(nextAutonomyMode("medium"), "high");
	assert.equal(nextAutonomyMode("high"), "off");
	assert.equal(isMacOptionLInput("¬"), true);
	assert.equal(isMacOptionLInput("l"), false);
});

test("runs only canonical low reads and exact allowlisted Bash automatically in Off", async () => {
	const policy = policyFor({ commandAllowlist: ["git status"] });
	const { gate, workspace } = await setup({ policy });

	assert.equal(await gate.handleToolCall({ toolCallId: "read", toolName: "read", input: { path: "notes.txt" } }), undefined);
	assert.equal(await gate.handleToolCall({ toolCallId: "grep", toolName: "functions.ffgrep", input: { path: ".", pattern: "before" } }), undefined);
	assert.equal(await gate.handleToolCall({ toolCallId: "bash", toolName: "bash", input: { command: "git status" } }), undefined);

	let prompts = 0;
	const ui = {
		...approvalUi("allow-once"),
		approveOperation: async () => {
			prompts += 1;
			return "allow-once" as const;
		},
	};
	assert.equal(await gate.handleToolCall({ toolCallId: "search", toolName: "web_search", input: { query: "Pi" } }, ui), undefined);
	assert.equal(await gate.handleToolCall({ toolCallId: "fetch", toolName: "fetch_content", input: { url: "https://example.test" } }, ui), undefined);
	assert.equal(await gate.handleToolCall({ toolCallId: "subagent", toolName: "subagent", input: { action: "status" } }, ui), undefined);
	assert.equal(prompts, 3);
	assert.equal(await readFile(join(workspace, "notes.txt"), "utf8"), "before\n");
});

test("enforces autonomy ceilings and denylist prompts independently of the active level", async () => {
	const { gate } = await setup({ policy: policyFor({ commandDenylist: ["git status"] }) });
	assert.equal(gate.setMode("low"), true);
	assert.match((await gate.handleToolCall({ toolCallId: "low-medium", toolName: "edit", input: editInput }))?.reason ?? "", /interactive/i);

	assert.equal(gate.setMode("medium"), true);
	assert.equal(await gate.handleToolCall({ toolCallId: "medium-edit", toolName: "edit", input: editInput }), undefined);
	await gate.handleToolResult("medium-edit", false);
	assert.match((await gate.handleToolCall({ toolCallId: "medium-high", toolName: "network_tool", input: {} }))?.reason ?? "", /interactive/i);

	assert.equal(gate.setMode("high"), true);
	assert.equal(await gate.handleToolCall({ toolCallId: "high-network", toolName: "network_tool", input: {} }), undefined);
	let prompts = 0;
	const ui = {
		...approvalUi("allow-once"),
		approveOperation: async () => {
			prompts += 1;
			return "allow-once" as const;
		},
	};
	assert.equal(await gate.handleToolCall({ toolCallId: "denylisted", toolName: "bash", input: { command: "git status" } }, ui), undefined);
	assert.equal(prompts, 1);
});

test("hard denials and missing interactive UIs block without an approval", async () => {
	const { gate, workspace } = await setup();
	await writeFile(join(workspace, ".env"), "TOKEN=secret\n");
	const noPromptUi = {
		...approvalUi("allow-once"),
		approveOperation: async () => {
			throw new Error("hard denial must not prompt");
		},
	};
	const protectedRead = await gate.handleToolCall({ toolCallId: "protected", toolName: "read", input: { path: ".env" } }, noPromptUi);
	assert.equal(protectedRead?.block, true);
	assert.match(protectedRead?.reason ?? "", /Protected data/i);

	const headless = await gate.handleToolCall(
		{ toolCallId: "headless", toolName: "edit", input: editInput },
		{ hasUI: false, confirm: async () => false },
	);
	assert.equal(headless?.block, true);
	assert.match(headless?.reason ?? "", /interactive/i);
});

test("blocks rejected and dismissed direct approvals", async () => {
	const { audit, gate } = await setup();
	const rejected = await gate.handleToolCall(
		{ toolCallId: "rejected", toolName: "network_tool", input: {} },
		approvalUi("deny"),
	);
	assert.equal(rejected?.block, true);
	assert.match(rejected?.reason ?? "", /rejected/i);

	const dismissed = await gate.handleToolCall(
		{ toolCallId: "dismissed", toolName: "network_tool", input: {} },
		{ hasUI: true, confirm: async () => false, approveOperation: async () => undefined },
	);
	assert.equal(dismissed?.block, true);
	assert.match(dismissed?.reason ?? "", /rejected/i);
	assert.deepEqual(audit.slice(-2).map((event) => event.approval), ["denied", "denied"]);
});

test("scopes Allow once to one event and journals supported workspace mutations for undo", async () => {
	const { audit, gate, workspace } = await setup();
	const ui = approvalUi("allow-once");

	assert.equal(await gate.handleToolCall({ toolCallId: "edit-once", toolName: "edit", input: editInput }, ui), undefined);
	await writeFile(join(workspace, "notes.txt"), "after\n");
	await gate.handleToolResult("edit-once", true);
	assert.equal(gate.getMode(), "off");
	assert.equal(audit.at(-2)?.approval, "allow-once");

	const repeat = await gate.handleToolCall(
		{ toolCallId: "edit-repeat", toolName: "edit", input: editInput },
		{ hasUI: false, confirm: async () => false },
	);
	assert.equal(repeat?.block, true);

	const undo = await gate.undo({ hasUI: true, confirm: async () => true });
	assert.equal(undo.ok, true);
	assert.equal(await readFile(join(workspace, "notes.txt"), "utf8"), "before\n");
});

test("raises but never lowers session autonomy for Allow always and fails closed on persistence errors", async () => {
	const { gate, workspace } = await setup();
	assert.equal(gate.setMode("low"), true);
	const persisted: AutonomyMode[] = [];
	const elevation = await gate.handleToolCall(
		{ toolCallId: "elevate", toolName: "edit", input: editInput },
		approvalUi("allow-always", async (mode) => {
			persisted.push(mode);
			return true;
		}),
	);
	assert.equal(elevation, undefined);
	assert.deepEqual(persisted, ["medium"]);
	assert.equal(gate.getMode(), "medium");
	await gate.startSession({ sessionId: "session-2", cwd: workspace });
	assert.equal(gate.getMode(), "off");


	const { gate: highGate } = await setup({ policy: policyFor({ defaultAutonomy: "high", commandDenylist: ["git status"] }) });
	const highPersisted: AutonomyMode[] = [];
	assert.equal(
		await highGate.handleToolCall(
			{ toolCallId: "forced-low", toolName: "bash", input: { command: "git status" } },
			approvalUi("allow-always", async (mode) => {
				highPersisted.push(mode);
				return true;
			}),
		),
		undefined,
	);
	assert.deepEqual(highPersisted, ["high"]);
	assert.equal(highGate.getMode(), "high");

	const { gate: failingGate } = await setup({ policy: policyFor({ defaultAutonomy: "low" }) });
	const failed = await failingGate.handleToolCall(
		{ toolCallId: "failed-elevation", toolName: "edit", input: editInput },
		approvalUi("allow-always", async () => false),
	);
	assert.equal(failed?.block, true);
	assert.equal(failingGate.getMode(), "low");
});

test("journals deterministic High Allow once redacted facts and fails closed when that write fails", async () => {
	const secret = "token=super-secret-value";
	const allowed = await setup();
	const allowedResult = await allowed.gate.handleToolCall(
		{ toolCallId: "high-once", toolName: "network_tool", input: { value: secret } },
		approvalUi("allow-once"),
	);
	assert.equal(allowedResult, undefined);
	const journalPath = join(allowed.agentDirectory, "security", "false-positive-journal-v1.json");
	const journal = await readFile(journalPath, "utf8");
	assert.equal(journal.includes(secret), false);
	const entries = JSON.parse(journal);
	assert.deepEqual(entries[0], {
		schemaVersion: 1,
		kind: "deterministic-high-allow-once",
		timestamp: entries[0].timestamp,
		sessionId: "session-1",
		operationDigest: entries[0].operationDigest,
		computedFloor: "high",
		computedReason: entries[0].computedReason,
		mode: "off",
		policyRevision: "sha256:test-policy",
		userDisposition: "allow-once",
	});
	assert.equal(JSON.stringify(allowed.audit).includes(secret), false);

	const failed = await setup();
	await mkdir(join(failed.agentDirectory, "security", "false-positive-journal-v1.json"), { recursive: true });
	const failure = await failed.gate.handleToolCall(
		{ toolCallId: "high-fail", toolName: "network_tool", input: {} },
		approvalUi("allow-once"),
	);
	assert.equal(failure?.block, true);
	assert.match(failure?.reason ?? "", /audit journal/i);

	const always = await setup();
	assert.equal(await always.gate.handleToolCall({ toolCallId: "high-always", toolName: "network_tool", input: {} }, approvalUi("allow-always")), undefined);
	await assert.rejects(readFile(join(always.agentDirectory, "security", "false-positive-journal-v1.json"), "utf8"));
});

test("runs clean Shield plans before approval and blocks negative scans without exposing data", async () => {
	const cleanScanner = new FakeShieldScanner();
	const clean = await setup({ shieldScanner: cleanScanner });
	assert.equal(
		await clean.gate.handleToolCall(
			{ toolCallId: "clean-commit", toolName: "bash", input: { command: "git commit -m message" } },
			approvalUi("allow-once"),
		),
		undefined,
	);
	assert.deepEqual(cleanScanner.calls.map((call) => call.plan.kind), ["commit"]);
	assert.equal(cleanScanner.calls[0]?.maxBytes, 1024);

	const blockedScanner = new FakeShieldScanner({ ok: false, reason: "staged credential-like assignment" });
	const blocked = await setup({ policy: policyFor({ defaultAutonomy: "high" }), shieldScanner: blockedScanner });
	const result = await blocked.gate.handleToolCall(
		{ toolCallId: "blocked-publish", toolName: "bash", input: { command: "git commit -m message && git push" } },
		approvalUi("allow-once"),
	);
	assert.equal(result?.block, true);
	assert.equal(result?.reason, "staged credential-like assignment");
	assert.deepEqual(blockedScanner.calls.map((call) => call.plan.kind), ["commit"]);
	assert.equal(JSON.stringify(blocked.audit).includes("credential-like assignment"), true);
});

test("rejects stale high-risk subagent work before scanning or prompting", async () => {
	const scanner = new FakeShieldScanner();
	const { gate } = await setup({ policy: policyFor({ defaultAutonomy: "high" }), shieldScanner: scanner });
	gate.setInheritedRevisionMismatch(true);
	const result = await gate.handleToolCall(
		{ toolCallId: "stale-subagent", toolName: "subagent", input: { action: "spawn", task: "inspect" } },
		approvalUi("allow-once"),
	);
	assert.equal(result?.block, true);
	assert.match(result?.reason ?? "", /did not inherit/i);
	assert.equal(scanner.calls.length, 0);
});
