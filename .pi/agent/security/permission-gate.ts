import { homedir } from "node:os";
import { join } from "node:path";
import { VERSION, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadPermissionPolicy } from "./config.ts";
import { redactText } from "./audit.ts";
import { PermissionGate } from "./gate.ts";
import { isAutonomyMode, nextAutonomyMode, type AutonomyMode } from "./types.ts";
import { isMacOptionLInput } from "./shortcuts.ts";
import { judgeHighRisk } from "./risk-judge.ts";
const ENTRY_TYPE = "permission-gate";
const INTERNAL_TOOLS = new Set(["permission_request", "permission_undo"]);

function agentDirectory(): string {
	return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}


function describeMode(mode: string): string {
	if (mode === "high") return "high autonomy: High-risk operations run unattended after deterministic hard denials.";
	if (mode === "auto") return "auto autonomy: Medium and High work must use permission_request in a prior model turn.";
	return `${mode} autonomy active.`;
}

export default async function permissionGateExtension(pi: ExtensionAPI): Promise<void> {
	const directory = agentDirectory();
	const loaded = await loadPermissionPolicy(directory);
	const inheritedRevision = process.env.PI_PERMISSION_POLICY_REVISION;
	process.env.PI_PERMISSION_POLICY_REVISION = loaded.revision;

	const gate = new PermissionGate({
		agentDirectory: directory,
		policy: loaded.policy,
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

	const applyMode = (mode: AutonomyMode, ctx: ExtensionContext) => {
		if (!gate.setMode(mode)) return;
		pi.appendEntry(ENTRY_TYPE, { kind: "mode", mode });
		ctx.ui.setStatus(ENTRY_TYPE, `permission: ${mode}`);
		ctx.ui.notify(describeMode(mode), mode === "high" ? "warning" : "info");
	};

	pi.registerFlag("permission-autonomy", {
		description: "Permission autonomy mode: auto, low, medium, or high",
		type: "string",
	});

	pi.registerTool({
		name: "permission_request",
		label: "Request Permission",
		description: "Request a one-time permit for one exact future Pi tool call using its canonical Pi name. It never runs the target operation.",
		promptSnippet: "Request a one-time permit with the canonical target name before Auto-mode Medium or High operations",
		promptGuidelines: [
			"In auto autonomy, use permission_request as the only tool call in a turn before any Medium or High operation, then make the exact target call in the following model turn.",
			"Set toolName to the target's canonical Pi name without a functions. prefix. Model-visible names with one functions. prefix are normalized, but all target arguments must otherwise match exactly.",
			"permission_request must contain the target tool's complete, exact argument object; changing the target path, command, or content invalidates its one-time permit.",
			"Set declaredRiskReason to one concise sentence explaining the selected risk from the target's side effects, reversibility, scope, and use of credentials, privilege, or untrusted code.",
		],
		parameters: Type.Object({
			toolName: Type.String({ description: "Canonical target Pi tool name without a functions. prefix" }),
			input: Type.Record(Type.String(), Type.Any({ description: "Exact target tool argument object" })),
			declaredRisk: Type.String({ description: "low, medium, or high" }),
			declaredRiskReason: Type.String({ description: "Why the model selected the declared risk" }),
			intent: Type.String({ description: "Why the operation is needed" }),
			expectedEffect: Type.String({ description: "Expected local or external effect" }),
			rollbackPlan: Type.String({ description: "Proposed rollback; only supported workspace text mutations receive a reversal snapshot" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await gate.requestPermission(params, {
				hasUI: ctx.hasUI,
				confirm: (title, message) => ctx.ui.confirm(title, redactText(message, 1_800)),
				approveHighRisk: async (title, message) => {
					const choice = await ctx.ui.select(
						`${title}\n\n${redactText(message, 1_800)}`,
						["Apply and remember", "Reject"],
					);
					if (choice === "Apply and remember") return "allow-and-journal";
					return "deny";
				},
				judgeHighRisk: (title, message) => judgeHighRisk(ctx, `${title}\n\n${redactText(message, 1_800)}`),
			});
			return { content: [{ type: "text", text: result.message }], details: { permitted: result.ok } };
		},
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
		description: "Cycle permission autonomy: auto, low, medium, high",
		handler: (ctx) => {
			applyMode(nextAutonomyMode(gate.getMode()), ctx);
		},
	});

	pi.registerCommand("permission-mode", {
		description: "Show or set permission autonomy: auto, low, medium, or high",
		handler: async (args, ctx) => {
			const requested = args.trim();
			if (!requested) {
				ctx.ui.notify(describeMode(gate.getMode()), "info");
				return;
			}
			if (!isAutonomyMode(requested)) {
				ctx.ui.notify("Usage: /permission-mode auto|low|medium|high", "error");
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
		let restoredMode: string | undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== ENTRY_TYPE) continue;
			const data = entry.data as { kind?: unknown; mode?: unknown } | undefined;
			if (data?.kind === "mode" && isAutonomyMode(data.mode)) restoredMode = data.mode;
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
		const identityRule = "For permission_request, set toolName to the target's canonical Pi name without a functions. prefix. A model-visible functions. prefix is normalized once; the target arguments must otherwise match exactly. Provide declaredRiskReason as one concise explanation for the selected risk.";
		const protocol = mode === "auto"
			? "For a Medium or High operation, call permission_request alone first and wait for its result. In the next model turn, call exactly the permitted target. Never place permission_request and its target in the same assistant response."
			: mode === "high"
				? "High autonomy is explicitly unattended. Hard-denied protected data and ambiguous paths remain blocked, and every tool call is audited."
				: "Follow the active deterministic permission policy; unsupported risk classes will be blocked.";
		return { systemPrompt: `${event.systemPrompt}\n\nPermission policy (${mode}): ${identityRule} ${protocol}` };
	});

	pi.on("tool_call", async (event, ctx) => {
		if (runtimeFailure) return { block: true, reason: runtimeFailure };
		if (INTERNAL_TOOLS.has(event.toolName)) return;
		try {
			return await gate.handleToolCall({
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				input: event.input as Record<string, unknown>,
			}, {
				hasUI: ctx.hasUI,
				confirm: (title, message) => ctx.ui.confirm(title, redactText(message, 1_800)),
				approveHighRisk: async (title, message) => {
					const choice = await ctx.ui.select(
						`${title}\n\n${redactText(message, 1_800)}`,
						["Apply and remember", "Reject"],
					);
					return choice === "Apply and remember" ? "allow-and-journal" : "deny";
				},
				judgeHighRisk: (title, message) => judgeHighRisk(ctx, `${title}\n\n${redactText(message, 1_800)}`),
			});
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
