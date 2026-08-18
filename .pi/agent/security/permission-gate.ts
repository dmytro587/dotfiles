import { homedir } from "node:os";
import { join } from "node:path";
import { VERSION, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { redactText } from "./audit.ts";
import { loadPermissionPolicy } from "./config.ts";
import { PermissionGate } from "./gate.ts";
import { isMacOptionLInput } from "./shortcuts.ts";
import { isAutonomyMode, nextAutonomyMode, type AutonomyMode } from "./types.ts";

const ENTRY_TYPE = "permission-gate";
const INTERNAL_TOOLS = new Set(["permission_undo"]);

function agentDirectory() {
	return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}


function describeMode(mode: AutonomyMode) {
	if (mode === "off") return "off autonomy: Only canonical safe reads run automatically. All other operations require direct approval.";
	if (mode === "low") return "low autonomy: Low-risk operations run automatically. Medium and High work requires direct approval.";
	if (mode === "medium") return "medium autonomy: Low and Medium work runs automatically. High work requires direct approval.";
	return "high autonomy: High-risk operations run unattended after deterministic hard denials.";
}

export default async function permissionGateExtension(pi: ExtensionAPI): Promise<void> {
	const directory = agentDirectory();
	const loaded = await loadPermissionPolicy(directory);
	const inheritedRevision = process.env.PI_PERMISSION_POLICY_REVISION;
	process.env.PI_PERMISSION_POLICY_REVISION = loaded.revision;

	const gate = new PermissionGate({
		agentDirectory: directory,
		policy: loaded.policy,
		commandPolicy: loaded.commandPolicy,
		policyRevision: loaded.revision,
		onAudit(event) {
			pi.appendEntry(ENTRY_TYPE, { kind: "audit", event });
		},
	});
	const runtimeFailure = loaded.error ?? (VERSION === loaded.policy.testedPiVersion
		? undefined
		: `Permission gate supports Pi ${loaded.policy.testedPiVersion}; this runtime is ${VERSION}.`);
	gate.setRuntimeFailure(runtimeFailure);
	gate.setInheritedRevisionMismatch(inheritedRevision !== undefined && inheritedRevision !== loaded.revision);

	const persistSessionMode = (mode: AutonomyMode, ctx: ExtensionContext) => {
		pi.appendEntry(ENTRY_TYPE, { kind: "mode", mode });
		ctx.ui.setStatus(ENTRY_TYPE, `permission: ${mode}`);
		ctx.ui.notify(describeMode(mode), mode === "high" ? "warning" : "info");
	};

	const applyMode = (mode: AutonomyMode, ctx: ExtensionContext) => {
		if (!gate.setMode(mode)) return;
		persistSessionMode(mode, ctx);
	};

	const directApprovalUi = (ctx: ExtensionContext) => ({
		hasUI: ctx.hasUI,
		confirm: (title: string, message: string) => ctx.ui.confirm(title, redactText(message, 1_800)),
		approveOperation: async (title: string, message: string) => {
			const choice = await ctx.ui.select(
				`${title}\n\n${redactText(message, 1_800)}`,
				["Allow once", "Allow always", "Reject"],
			);
			if (choice === "Allow once") return "allow-once";
			if (choice === "Allow always") return "allow-always";
			return "deny";
		},
		persistMode: async (mode: AutonomyMode) => {
			try {
				persistSessionMode(mode, ctx);
				return true;
			} catch {
				return false;
			}
		},
	});

	pi.registerFlag("permission-autonomy", {
		description: "Permission autonomy mode: off, low, medium, or high",
		type: "string",
	});

	pi.registerTool({
		name: "permission_undo",
		label: "Undo Journaled Mutation",
		description: "Restore the most recent checksum-safe file mutation captured by the permission journal after user review.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const result = await gate.undo({
				hasUI: ctx.hasUI,
				confirm: (title, message) => ctx.ui.confirm(title, redactText(message, 1_800)),
			});
			return { content: [{ type: "text", text: result.message }], details: { undone: result.ok } };
		},
	});

	pi.registerShortcut("alt+l", {
		description: "Cycle permission autonomy: off, low, medium, high",
		handler: (ctx) => {
			applyMode(nextAutonomyMode(gate.getMode()), ctx);
		},
	});

	pi.registerCommand("permission-mode", {
		description: "Show or set permission autonomy: off, low, medium, or high",
		handler: async (args, ctx) => {
			const requested = args.trim();
			if (!requested) {
				ctx.ui.notify(describeMode(gate.getMode()), "info");
				return;
			}
			if (!isAutonomyMode(requested)) {
				ctx.ui.notify("Usage: /permission-mode off|low|medium|high", "error");
				return;
			}
			applyMode(requested, ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		await gate.startSession({ sessionId: ctx.sessionManager.getSessionId(), cwd: ctx.cwd });

		ctx.ui.onTerminalInput((data) => {
			if (!isMacOptionLInput(data)) return;
			applyMode(nextAutonomyMode(gate.getMode()), ctx);
			return { consume: true };
		});
		const flagMode = pi.getFlag("permission-autonomy");
		let restoredMode: AutonomyMode | undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== ENTRY_TYPE || entry.data === null || typeof entry.data !== "object" || Array.isArray(entry.data)) continue;
			if ("kind" in entry.data && entry.data.kind === "mode" && "mode" in entry.data && isAutonomyMode(entry.data.mode)) restoredMode = entry.data.mode;
		}
		if (isAutonomyMode(flagMode)) gate.setMode(flagMode);
		else if (restoredMode) gate.setMode(restoredMode);
		ctx.ui.setStatus(ENTRY_TYPE, `permission: ${gate.getMode()}`);
		if (runtimeFailure && ctx.hasUI) ctx.ui.notify(runtimeFailure, "error");
	});

	pi.on("before_agent_start", async (event) => {
		if (runtimeFailure) {
			return { systemPrompt: `${event.systemPrompt}\n\nPermission gate is unavailable: ${runtimeFailure} Do not attempt any tool calls.` };
		}
		const mode = gate.getMode();
		const protocol = mode === "off"
			? "Only canonical safe reads are automatic. The trusted runtime will ask the user directly before every other operation."
			: mode === "low"
				? "Low-risk operations run automatically. The trusted runtime will ask the user directly before Medium or High work."
				: mode === "medium"
					? "Low and Medium operations run automatically. The trusted runtime will ask the user directly before High work."
					: "High autonomy is explicitly unattended. Hard-denied protected data and ambiguous paths remain blocked, and every tool call is audited.";
		return { systemPrompt: `${event.systemPrompt}\n\nPermission policy (${mode}): ${protocol}` };
	});

	pi.on("tool_call", async (event, ctx) => {
		if (runtimeFailure) return { block: true, reason: runtimeFailure };
		if (INTERNAL_TOOLS.has(event.toolName)) return;
		try {
			return await gate.handleToolCall({
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				input: event.input as Record<string, unknown>,
			}, directApprovalUi(ctx));
		} catch {
			return { block: true, reason: "Permission gate failed while assessing this operation." };
		}
	});

	pi.on("tool_result", async (event) => {
		if (INTERNAL_TOOLS.has(event.toolName)) return;
		try {
			await gate.handleToolResult(event.toolCallId, !event.isError);
		} catch {
			// A tool already ran; keep its result intact and leave any failed journal
			// entry non-undoable rather than claiming a rollback record exists.
		}
	});
}
