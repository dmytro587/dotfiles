import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PermissionGate } from "./gate.ts";
import { nextAutonomyMode } from "./types.ts";
import { isMacOptionLInput } from "./shortcuts.ts";
import type { AuditEvent, PermissionPolicyConfig } from "./types.ts";

const policy: PermissionPolicyConfig = {
	version: 1,
	testedPiVersion: "0.83.0",
	defaultAutonomy: "auto",
	limits: {
		maxTextFileBytes: 1024,
		maxOperationBytes: 1024,
		maxPermitRequestBytes: 1024,
		permitTtlMs: 60_000,
		maxMediumFilesPerSession: 5,
		maxMediumSnapshotBytesPerSession: 4096,
	},
};

async function setup() {
	const root = await mkdtemp(join(tmpdir(), "pi-permission-gate-"));
	const workspace = join(root, "workspace");
	await mkdir(workspace);
	await writeFile(join(workspace, "notes.txt"), "before\n");
	const audit: AuditEvent[] = [];
	const agentDirectory = join(root, "agent");
	const gate = new PermissionGate({
		agentDirectory,
		policy,
		policyRevision: "sha256:test-policy",
		onAudit: (event) => audit.push(event),
	});
	await gate.startSession({ sessionId: "session-1", cwd: workspace });
	return { agentDirectory, gate, workspace, audit };
}

const approvingUi = { hasUI: true, confirm: async () => true };
const headlessUi = { hasUI: false, confirm: async () => false };

const editInput = { path: "notes.txt", edits: [{ oldText: "before", newText: "after" }] };

test("cycles permission autonomy modes in order and wraps high to auto", () => {
	assert.equal(nextAutonomyMode("auto"), "low");
	assert.equal(nextAutonomyMode("low"), "medium");
	assert.equal(nextAutonomyMode("medium"), "high");
	assert.equal(nextAutonomyMode("high"), "auto");
});


test("recognizes the raw macOS Option+L input used by VS Code terminals", () => {
	assert.equal(isMacOptionLInput("¬"), true);
	assert.equal(isMacOptionLInput("l"), false);
});
test("rejects a permission request without a declared risk rationale", async () => {
	const { gate } = await setup();
	const result = await gate.requestPermission(
		{
			toolName: "edit",
			input: editInput,
			declaredRisk: "medium",
			intent: "Update the example text.",
			expectedEffect: "One workspace text file changes.",
			rollbackPlan: "Restore the journaled pre-image.",
		},
		approvingUi,
	);
	assert.equal(result.ok, false);
});

test("redacts a declared risk rationale in the permit audit event", async () => {
	const { audit, gate } = await setup();
	const result = await gate.requestPermission(
		{
			toolName: "bash",
			input: { command: "npm test" },
			declaredRisk: "medium",
			declaredRiskReason: "The operation uses cookie=session-value and token=secret-value only for the requested test.",
			intent: "Run the test suite.",
			expectedEffect: "Local test artifacts may change.",
			rollbackPlan: "No filesystem rollback is available.",
		},
		approvingUi,
	);
	assert.equal(result.ok, true);
	assert.equal(audit.at(-1)?.declaredRiskReason, "The operation uses cookie=[redacted] and token=[redacted] only for the requested test.");
	assert.equal(JSON.stringify(audit).includes("session-value"), false);
	assert.equal(JSON.stringify(audit).includes("secret-value"), false);
});

test("Auto mode blocks Medium work until a matching one-time permit is issued, then journals it for undo", async () => {
	const { gate, workspace, audit } = await setup();
	const direct = await gate.handleToolCall({ toolCallId: "edit-1", toolName: "edit", input: editInput });
	assert.match(direct?.reason ?? "", /permission_request/i);

	const permit = await gate.requestPermission(
		{
			toolName: "edit",
			input: editInput,
			declaredRisk: "medium",
			declaredRiskReason: "The edit is a bounded workspace text mutation.",
			intent: "Update the example text.",
			expectedEffect: "One workspace text file changes.",
			rollbackPlan: "Restore the journaled pre-image.",
		},
		approvingUi,
	);
	assert.equal(permit.ok, true);

	assert.equal(await gate.handleToolCall({ toolCallId: "edit-2", toolName: "edit", input: editInput }), undefined);
	await writeFile(join(workspace, "notes.txt"), "after\n");
	assert.equal(audit.at(-1)?.declaredRisk, "medium");
	assert.equal(audit.at(-1)?.declaredRiskReason, "The edit is a bounded workspace text mutation.");
	await gate.handleToolResult("edit-2", true);
	assert.equal(await readFile(join(workspace, "notes.txt"), "utf8"), "after\n");

	const undo = await gate.undo(approvingUi);
	assert.equal(undo.ok, true);
	assert.equal(await readFile(join(workspace, "notes.txt"), "utf8"), "before\n");

	const repeated = await gate.handleToolCall({ toolCallId: "edit-3", toolName: "edit", input: editInput });
	assert.match(repeated?.reason ?? "", /permission_request/i);
	assert.equal(JSON.stringify(audit).includes("notes.txt"), false, "audit events must not retain resource paths");
	assert.equal(JSON.stringify(audit).includes("before"), false, "audit events must not retain file contents");
});

test("matches a namespaced Medium permit to the native Pi event exactly once", async () => {
	const { gate, audit } = await setup();
	const permit = await gate.requestPermission(
		{
			toolName: "functions.edit",
			input: editInput,
			declaredRisk: "medium",
			declaredRiskReason: "The operation's declared risk matches its requested scope.",
			intent: "Update the example text.",
			expectedEffect: "One workspace text file changes.",
			rollbackPlan: "Restore the journaled pre-image.",
		},
		approvingUi,
	);
	assert.equal(permit.ok, true);
	assert.equal(await gate.handleToolCall({ toolCallId: "native-edit", toolName: "edit", input: editInput }), undefined);
	await gate.handleToolResult("native-edit", false);
	assert.match((await gate.handleToolCall({ toolCallId: "repeat-edit", toolName: "edit", input: editInput }))?.reason ?? "", /permission_request/i);
	assert.equal(audit.at(-2)?.tool, "edit");
});

test("consumes a Medium nonjournal permit without creating an undo entry", async () => {
	const { gate, audit } = await setup();
	const call = { toolCallId: "test-1", toolName: "bash", input: { command: "npm test" } };
	assert.match((await gate.handleToolCall(call))?.reason ?? "", /permission_request/i);

	const permit = await gate.requestPermission(
		{
			toolName: "bash",
			input: call.input,
			declaredRisk: "medium",
			declaredRiskReason: "The operation's declared risk matches its requested scope.",
			intent: "Run the test suite.",
			expectedEffect: "Local test artifacts may change.",
			rollbackPlan: "No filesystem rollback is available.",
		},
		approvingUi,
	);
	assert.equal(permit.ok, true);
	assert.equal(await gate.handleToolCall(call), undefined);
	assert.equal(audit.at(-1)?.reversible, false);
	assert.equal((await gate.undo(approvingUi)).ok, false);
	assert.match((await gate.handleToolCall({ ...call, toolCallId: "test-2" }))?.reason ?? "", /permission_request/i);
});

test("rejects under-classification, mismatched permits, duplicate permits, and headless Auto High work", async () => {
	const { gate } = await setup();
	const underclassified = await gate.requestPermission(
		{
			toolName: "network_tool",
			input: { url: "https://example.test" },
			declaredRisk: "medium",
			declaredRiskReason: "The operation's declared risk matches its requested scope.",
			intent: "Call an external service.",
			expectedEffect: "A network request is sent.",
			rollbackPlan: "No local rollback is available.",
		},
		approvingUi,
	);
	assert.equal(underclassified.ok, false);

	const requested = await gate.requestPermission(
		{
			toolName: "edit",
			input: editInput,
			declaredRisk: "medium",
			declaredRiskReason: "The operation's declared risk matches its requested scope.",
			intent: "Update the example text.",
			expectedEffect: "One workspace file changes.",
			rollbackPlan: "Restore the pre-image.",
		},
		approvingUi,
	);
	assert.equal(requested.ok, true);
	const duplicate = await gate.requestPermission(
		{
			toolName: "edit",
			input: { path: "notes.txt", edits: [{ oldText: "before", newText: "different" }] },
			declaredRisk: "medium",
			declaredRiskReason: "The operation's declared risk matches its requested scope.",
			intent: "Make another change.",
			expectedEffect: "One workspace file changes.",
			rollbackPlan: "Restore the pre-image.",
		},
		approvingUi,
	);
	assert.equal(duplicate.ok, false);
	const mismatched = await gate.handleToolCall({
		toolCallId: "edit-mismatch",
		toolName: "edit",
		input: { path: "notes.txt", edits: [{ oldText: "before", newText: "different" }] },
	});
	assert.match(mismatched?.reason ?? "", /permission_request/i);

	const headlessHigh = await gate.requestPermission(
		{
			toolName: "network_tool",
			input: { url: "https://example.test" },
			declaredRisk: "high",
			declaredRiskReason: "The operation's declared risk matches its requested scope.",
			intent: "Call an external service.",
			expectedEffect: "A network request is sent.",
			rollbackPlan: "No local rollback is available.",
		},
		headlessUi,
	);
	assert.equal(headlessHigh.ok, false);
});

test("records an approved High operation as a redacted false positive", async () => {
	const { agentDirectory, gate } = await setup();
	const result = await gate.requestPermission(
		{
			toolName: "network_tool",
			input: { url: "https://operation.example/private" },
			declaredRisk: "high",
			declaredRiskReason: "This is a false positive; cookie=session-secret is not used.",
			intent: "Inspect the external operation.",
			expectedEffect: "An external request is sent.",
			rollbackPlan: "No local rollback is available.",
		},
		{
			hasUI: true,
			confirm: async () => true,
			approveHighRisk: async () => "allow-and-journal" as const,
		},
	);
	assert.equal(result.ok, true);
	const entries = JSON.parse(await readFile(join(agentDirectory, "security", "false-positive-journal.json"), "utf8"));
	const directory = await stat(join(agentDirectory, "security"));
	const journal = await stat(join(agentDirectory, "security", "false-positive-journal.json"));
	assert.equal(directory.mode & 0o777, 0o700);
	assert.equal(journal.mode & 0o777, 0o600);
	assert.equal(entries.length, 1);
	assert.equal(entries[0].kind, "false-positive");
	assert.equal(entries[0].sessionId, "session-1");
	assert.equal(entries[0].canonicalToolName, "network_tool");
	assert.equal(entries[0].declaredRisk, "high");
	assert.equal(entries[0].computedFloor, "high");
	assert.equal(entries[0].effectiveRisk, "high");
	assert.equal(entries[0].userDisposition, "false-positive");
	assert.equal(JSON.stringify(entries).includes("session-secret"), false);
	assert.equal(JSON.stringify(entries).includes("operation.example"), false);
});

test("denies a journal choice when the false-positive journal cannot be written", async () => {
	const { agentDirectory, gate } = await setup();
	await mkdir(join(agentDirectory, "security", "false-positive-journal.json"), { recursive: true });
	const result = await gate.requestPermission(
		{
			toolName: "network_tool",
			input: { url: "https://operation.example/private" },
			declaredRisk: "high",
			declaredRiskReason: "The operation is suspected to be a false positive.",
			intent: "Inspect the external operation.",
			expectedEffect: "An external request is sent.",
			rollbackPlan: "No local rollback is available.",
		},
		{
			hasUI: true,
			confirm: async () => true,
			approveHighRisk: async () => "allow-and-journal" as const,
		},
	);
	assert.equal(result.ok, false);
	assert.match(result.message, /journal/i);
});

test("keeps ordinary approval and denial distinct from false-positive journaling", async () => {
	const request = {
		toolName: "network_tool",
		input: { url: "https://operation.example/private" },
		declaredRisk: "high" as const,
		declaredRiskReason: "The external operation is intentionally approved.",
		intent: "Inspect the external operation.",
		expectedEffect: "An external request is sent.",
		rollbackPlan: "No local rollback is available.",
	};
	const allowed = await setup();
	const allowedResult = await allowed.gate.requestPermission(request, {
		hasUI: true,
		confirm: async () => false,
		approveHighRisk: async () => "allow" as const,
	});
	assert.equal(allowedResult.ok, true);
	await assert.rejects(readFile(join(allowed.agentDirectory, "security", "false-positive-journal.json"), "utf8"));

	const denied = await setup();
	const deniedResult = await denied.gate.requestPermission(request, {
		hasUI: true,
		confirm: async () => true,
		approveHighRisk: async () => "deny" as const,
	});
	assert.equal(deniedResult.ok, false);
});

test("explicit high autonomy permits High work unattended while preserving hard denials", async () => {
	const { gate } = await setup();
	assert.equal(gate.setMode("high"), true);
	assert.equal(
		await gate.handleToolCall({ toolCallId: "bash-high", toolName: "bash", input: { command: "npm test" } }),
		undefined,
	);
	const protectedRead = await gate.handleToolCall({ toolCallId: "secret", toolName: "read", input: { path: ".env" } });
	assert.equal(protectedRead?.block, true);
	const destructiveBash = await gate.handleToolCall({ toolCallId: "delete", toolName: "bash", input: { command: "rm -rf temporary" } });
	assert.equal(destructiveBash?.block, true);
});
