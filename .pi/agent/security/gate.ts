import { AuditRecorder, redactText } from "./audit.ts";
import { FalsePositiveJournal } from "./false-positive-journal.ts";
import { stableJson } from "./canonical.ts";
import { canonicalToolName } from "./tool-identity.ts";
import { ReversibilityJournal, type JournalEntry } from "./journal.ts";
import { PermitStore } from "./permits.ts";
import { assess } from "./policy.ts";
import {
	isAutonomyMode,
	isRiskClass,
	maxRisk,
	riskRank,
	type Assessment,
	type AuditEvent,
	type HighRiskApproval,
	type AutonomyMode,
	type PermissionPolicyConfig,
	type PermissionRequest,
	type RiskClass,
} from "./types.ts";

export interface PermissionUi {
	hasUI: boolean;
	confirm(title: string, message: string): Promise<boolean>;
	approveHighRisk?(title: string, message: string): Promise<HighRiskApproval | undefined>;
}

export interface GateSession {
	sessionId: string;
	cwd: string;
}

export interface GateOptions {
	agentDirectory: string;
	policy: PermissionPolicyConfig;
	policyRevision: string;
	onAudit?(event: AuditEvent): void;
}

export interface ToolCall {
	toolCallId: string;
	toolName: string;
	input: Record<string, unknown>;
}

interface PendingMutation {
	assessment: Assessment;
	journalEntry: JournalEntry;
	declaredRisk?: RiskClass;
	declaredRiskReason?: string;
	effectiveRisk?: RiskClass;
	approval?: AuditEvent["approval"];
}

function text(value: unknown, maxLength = 2_000): string | undefined {
	return typeof value === "string" && value.trim() !== "" && value.length <= maxLength ? value : undefined;
}

function operationPreview(request: PermissionRequest, assessment: Assessment): string {
	if (assessment.canonicalToolName === "bash" && typeof request.input.command === "string") {
		return `Command: ${request.input.command.slice(0, 400)}`;
	}
	if (assessment.resource) {
		if (assessment.canonicalToolName === "edit" || assessment.canonicalToolName === "write") {
			return `Target: ${assessment.resource.relativePath}\nMutation payload: ${Buffer.byteLength(stableJson(request.input), "utf8")} bytes`;
		}
		return `Target: ${assessment.resource.relativePath}`;
	}
	return "Target: custom or external tool operation";
}

function validRequest(value: unknown): value is PermissionRequest {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const request = value as Partial<PermissionRequest>;
	return (
		typeof request.toolName === "string" &&
		request.input !== null &&
		typeof request.input === "object" &&
		!Array.isArray(request.input) &&
		isRiskClass(request.declaredRisk) &&
		text(request.declaredRiskReason) !== undefined &&
		text(request.intent) !== undefined &&
		text(request.expectedEffect) !== undefined &&
		text(request.rollbackPlan) !== undefined
	);
}

/**
 * Framework-independent enforcement core. The Pi extension only adapts its
 * events and dialogs to this class, which makes the authorization contract
 * testable without a model or a running TUI.
 */
export class PermissionGate {
	private readonly options: GateOptions;
	private readonly audit: AuditRecorder;
	private readonly permits = new PermitStore();
	private readonly pendingMutations = new Map<string, PendingMutation>();
	private readonly falsePositiveJournal: FalsePositiveJournal;
	private journal?: ReversibilityJournal;
	private session?: GateSession;
	private mediumBudget = { fileCount: 0, snapshotBytes: 0 };
	private mode: AutonomyMode;
	private runtimeFailure?: string;
	private inheritedRevisionMismatch = false;

	constructor(options: GateOptions) {
		this.options = options;
		this.audit = new AuditRecorder(options.agentDirectory);
		this.falsePositiveJournal = new FalsePositiveJournal(options.agentDirectory);
		this.mode = options.policy.defaultAutonomy;
	}

	setRuntimeFailure(reason: string | undefined): void {
		this.runtimeFailure = reason;
	}

	setInheritedRevisionMismatch(mismatch: boolean): void {
		this.inheritedRevisionMismatch = mismatch;
	}

	getMode(): AutonomyMode {
		return this.mode;
	}

	setMode(mode: unknown): boolean {
		if (!isAutonomyMode(mode)) return false;
		this.mode = mode;
		return true;
	}

	async startSession(session: GateSession): Promise<{ recoveredUnknown: number }> {
		this.session = session;
		this.pendingMutations.clear();
		this.journal = new ReversibilityJournal(this.options.agentDirectory, session.sessionId);
		const recovery = await this.journal.recover();
		this.mediumBudget = await this.journal.usage();
		if (recovery.notApplied || recovery.unknown) {
			await this.record({
				operationDigest: "sha256:journal-recovery",
				tool: "permission-journal",
				computedFloor: "medium",
				effectiveRisk: "medium",
				decision: recovery.unknown ? "recovery-unknown" : "recovery-not-applied",
				reversible: false,
				approval: "not-required",
				reason: "Recovered incomplete journal records without making uncertain entries undoable.",
			});
		}
		return { recoveredUnknown: recovery.unknown };
	}

	private unavailable(): string | undefined {
		if (this.runtimeFailure) return this.runtimeFailure;
		if (!this.session || !this.journal) return "Permission gate has not initialized its session state.";
		return undefined;
	}

	private async assessCall(toolName: string, input: Record<string, unknown>): Promise<Assessment> {
		if (!this.session) throw new Error("Permission gate session is not initialized.");
		return assess(toolName, input, {
			cwd: this.session.cwd,
			sessionId: this.session.sessionId,
			policyRevision: this.options.policyRevision,
			policy: this.options.policy,
			mediumBudget: this.mediumBudget,
		});
	}

	private async record(
		partial: Omit<AuditEvent, "timestamp" | "sessionId" | "mode" | "policyRevision">,
	): Promise<void> {
		const event: AuditEvent = {
			timestamp: new Date().toISOString(),
			sessionId: this.session?.sessionId ?? "uninitialized",
			mode: this.mode,
			policyRevision: this.options.policyRevision,
			...partial,
		};
		this.options.onAudit?.(event);
		await this.audit.append(event);
	}

	private async recordAssessment(
		assessment: Assessment,
		decision: string,
		approval: AuditEvent["approval"],
		declaredRisk?: RiskClass,
		declaredRiskReason?: string,
		effectiveRisk = assessment.floor,
	): Promise<void> {
		await this.record({
			operationDigest: assessment.operationDigest,
			resourceDigest: assessment.resourceDigest,
			tool: assessment.toolName,
			declaredRisk,
			declaredRiskReason: declaredRiskReason ? redactText(declaredRiskReason) : undefined,
			computedFloor: assessment.floor,
			effectiveRisk,
			decision,
			reversible: assessment.reversible,
			approval,
			reason: assessment.reason,
		});
	}

	private permitFor(assessment: Assessment, minimumRisk: RiskClass) {
		const permit = this.permits.peek(assessment.operationDigest);
		if (!permit || permit.sessionId !== this.session?.sessionId || riskRank(permit.effectiveRisk) < riskRank(minimumRisk)) {
			return undefined;
		}
		return permit;
	}

	private checkSubagentInheritance(assessment: Assessment): string | undefined {
		if (this.inheritedRevisionMismatch && assessment.floor === "high") {
			return "High-risk work is denied because this subagent did not inherit the active policy revision.";
		}
		return undefined;
	}

	async requestPermission(value: unknown, ui: PermissionUi): Promise<{ ok: boolean; message: string }> {
		const unavailable = this.unavailable();
		if (unavailable) return { ok: false, message: unavailable };
		if (!validRequest(value)) return { ok: false, message: "Permission request must include complete target arguments and non-empty explanations." };
		const request = value;

		let requestBytes: number;
		try {
			requestBytes = Buffer.byteLength(stableJson(value.input), "utf8");
		} catch {
			return { ok: false, message: "Permission request arguments must be JSON-compatible." };
		}
		if (requestBytes > this.options.policy.limits.maxPermitRequestBytes) {
			return { ok: false, message: "Permission request exceeds the configured payload limit; the operation remains High and cannot receive an Auto permit." };
		}
		const requestedToolName = canonicalToolName(request.toolName);
		if (requestedToolName === "permission_request" || requestedToolName === "permission_undo") {
			return { ok: false, message: "Permission tools cannot authorize themselves." };
		}

		const assessment = await this.assessCall(request.toolName, request.input);
		if (assessment.hardDeny) {
			await this.recordAssessment(assessment, "denied", "denied", request.declaredRisk, request.declaredRiskReason);
			return { ok: false, message: assessment.reason };
		}
		if (riskRank(request.declaredRisk) < riskRank(assessment.floor)) {
			await this.recordAssessment(assessment, "denied-underclassified", "denied", request.declaredRisk, request.declaredRiskReason);
			return { ok: false, message: "Declared risk is below the deterministic policy floor." };
		}

		const effectiveRisk = maxRisk(request.declaredRisk, assessment.floor);
		let approval: "not-required" | "confirmed" | "confirmed-and-journaled" | "mode-high" = "not-required";
		if (this.mode === "auto" && effectiveRisk === "high") {
			if (!ui.hasUI) {
				await this.recordAssessment(assessment, "denied-no-ui", "denied", request.declaredRisk, request.declaredRiskReason, effectiveRisk);
				return { ok: false, message: "High-risk Auto work requires an interactive approval UI." };
			}
			const message = `Tool: ${assessment.canonicalToolName}\n${operationPreview(request, assessment)}\nRisk: ${effectiveRisk}\nDeclared risk rationale: ${request.declaredRiskReason}\nReason: ${assessment.reason}\nIntent: ${request.intent}\nExpected effect: ${request.expectedEffect}\nRollback: ${request.rollbackPlan}`;
			const selected = ui.approveHighRisk
				? await ui.approveHighRisk("Allow high-risk Pi operation?", message) ?? "deny"
				: await ui.confirm("Allow high-risk Pi operation?", message) ? "allow" : "deny";
			if (selected === "deny") {
				await this.recordAssessment(assessment, "denied-by-user", "denied", request.declaredRisk, request.declaredRiskReason, effectiveRisk);
				return { ok: false, message: "High-risk operation was not approved." };
			}
			if (selected === "allow-and-journal") {
				try {
					await this.falsePositiveJournal.record({
						kind: "false-positive",
						timestamp: new Date().toISOString(),
						sessionId: this.session!.sessionId,
						runtimeToolName: assessment.toolName,
						canonicalToolName: assessment.canonicalToolName,
						operationDigest: assessment.operationDigest,
						resourceDigest: assessment.resourceDigest,
						declaredRisk: request.declaredRisk,
						declaredRiskReason: redactText(request.declaredRiskReason),
						computedFloor: assessment.floor,
						computedReason: redactText(assessment.reason),
						effectiveRisk,
						mode: this.mode,
						intent: redactText(request.intent),
						expectedEffect: redactText(request.expectedEffect),
						rollbackPlan: redactText(request.rollbackPlan),
						userDisposition: "false-positive",
					});
				} catch {
					await this.recordAssessment(assessment, "denied-journal-failure", "denied", request.declaredRisk, request.declaredRiskReason, effectiveRisk);
					return { ok: false, message: "High-risk operation was not approved because the false-positive journal could not be written." };
				}
				approval = "confirmed-and-journaled";
			} else {
				approval = "confirmed";
			}
		} else if (this.mode === "high" && effectiveRisk === "high") {
			approval = "mode-high";
		}

		const issued = this.permits.issue({
			operationDigest: assessment.operationDigest,
			resourceDigest: assessment.resourceDigest,
			sessionId: this.session!.sessionId,
			toolName: assessment.canonicalToolName,
			effectiveRisk,
			declaredRisk: request.declaredRisk,
			declaredRiskReason: request.declaredRiskReason,
			approval,
			expiresAt: Date.now() + this.options.policy.limits.permitTtlMs,
		});
		if (!issued.ok) {
			await this.recordAssessment(assessment, "denied-duplicate-permit", "denied", request.declaredRisk, request.declaredRiskReason, effectiveRisk);
			return { ok: false, message: issued.reason };
		}
		await this.recordAssessment(assessment, "permit-issued", approval, request.declaredRisk, request.declaredRiskReason, effectiveRisk);
		return {
			ok: true,
			message: `One-time permit issued for ${assessment.canonicalToolName}. Issue the exact target tool call in the next model turn.`,
		};
	}

	async handleToolCall(call: ToolCall): Promise<{ block: true; reason: string } | undefined> {
		const unavailable = this.unavailable();
		if (unavailable) return { block: true, reason: unavailable };
		const assessment = await this.assessCall(call.toolName, call.input);
		if (assessment.hardDeny) {
			await this.recordAssessment(assessment, "blocked", "denied");
			return { block: true, reason: assessment.reason };
		}
		const inheritanceFailure = this.checkSubagentInheritance(assessment);
		if (inheritanceFailure) {
			await this.recordAssessment(assessment, "blocked", "denied");
			return { block: true, reason: inheritanceFailure };
		}
		if (assessment.floor === "low") {
			await this.recordAssessment(assessment, "allowed", "not-required");
			return undefined;
		}
		if (this.mode === "low") {
			await this.recordAssessment(assessment, "blocked", "denied");
			return { block: true, reason: `${assessment.floor} operations are denied in low autonomy mode.` };
		}
		if (assessment.floor === "high") {
			if (this.mode === "medium") {
				await this.recordAssessment(assessment, "blocked", "denied");
				return { block: true, reason: "High-risk operations are denied in medium autonomy mode." };
			}
			if (this.mode === "auto") {
				const permit = this.permitFor(assessment, "high");
				if (!permit) {
					await this.recordAssessment(assessment, "blocked-missing-permit", "denied");
					return { block: true, reason: "High-risk Auto operation requires permission_request in a prior model turn." };
				}
				this.permits.consume(assessment.operationDigest);
				await this.recordAssessment(assessment, "allowed", permit.approval, permit.declaredRisk, permit.declaredRiskReason, permit.effectiveRisk);
				return undefined;
			}
			// The user selected high autonomy explicitly. High work is audited but
			// deliberately unattended, while hard denials still apply above.
			await this.recordAssessment(assessment, "allowed", "mode-high");
			return undefined;
		}

		// Auto still requires a permit for every Medium operation. Only workspace
		// text mutations also require a reversal journal immediately before execution.
		let permit;
		if (this.mode === "auto") {
			permit = this.permitFor(assessment, "medium");
			if (!permit) {
				await this.recordAssessment(assessment, "blocked-missing-permit", "denied");
				return { block: true, reason: "Medium Auto operation requires permission_request in a prior model turn." };
			}
		}
		if (assessment.journalAdapter === "none") {
			if (permit && !this.permits.consume(assessment.operationDigest)) {
				await this.recordAssessment(assessment, "blocked-expired-permit", "denied");
				return { block: true, reason: "Permission permit expired before execution." };
			}
			await this.recordAssessment(assessment, "allowed", permit?.approval ?? "not-required", permit?.declaredRisk, permit?.declaredRiskReason, permit?.effectiveRisk ?? assessment.floor);
			return undefined;
		}
		try {
			const journalEntry = await this.journal!.begin({
				operationDigest: assessment.operationDigest,
				toolName: call.toolName as "edit" | "write",
				resource: assessment.resource!,
			});
			if (permit && !this.permits.consume(assessment.operationDigest)) {
				await this.journal!.finalize(journalEntry.id, false);
				await this.recordAssessment(assessment, "blocked-expired-permit", "denied");
				return { block: true, reason: "Permission permit expired before execution." };
			}
			this.pendingMutations.set(call.toolCallId, {
				assessment,
				journalEntry,
				declaredRisk: permit?.declaredRisk,
				declaredRiskReason: permit?.declaredRiskReason,
				effectiveRisk: permit?.effectiveRisk,
				approval: permit?.approval,
			});
			this.mediumBudget = await this.journal!.usage();
			await this.recordAssessment(assessment, "allowed", permit?.approval ?? "not-required", permit?.declaredRisk, permit?.declaredRiskReason, permit?.effectiveRisk ?? assessment.floor);
			return undefined;
		} catch {
			await this.recordAssessment(assessment, "blocked-journal-failure", "denied");
			return { block: true, reason: "Medium operation blocked because its reversal journal could not be created." };
		}
	}

	async handleToolResult(toolCallId: string, succeeded: boolean): Promise<void> {
		const pending = this.pendingMutations.get(toolCallId);
		if (!pending || !this.journal) return;
		this.pendingMutations.delete(toolCallId);
		const entry = await this.journal.finalize(pending.journalEntry.id, succeeded);
		await this.recordAssessment(
			pending.assessment,
			entry.status === "applied" ? "completed" : succeeded ? "completed-unknown-journal-state" : "failed",
			pending.approval ?? "not-required",
			pending.declaredRisk,
			pending.declaredRiskReason,
			pending.effectiveRisk ?? pending.assessment.floor,
		);
	}

	async undo(ui: PermissionUi): Promise<{ ok: boolean; message: string }> {
		const unavailable = this.unavailable();
		if (unavailable) return { ok: false, message: unavailable };
		if (this.mode === "low") return { ok: false, message: "Undo is a Medium operation and is denied in low autonomy mode." };
		if (!ui.hasUI) return { ok: false, message: "Undo requires an interactive review of the journal summary." };
		const entry = await this.journal!.latestEligible();
		if (!entry) return { ok: false, message: "No eligible journaled mutation is available to undo." };
		const confirmed = await ui.confirm(
			"Undo most recent journaled mutation?",
			`Target: ${entry.targetLabel}\nTool: ${entry.toolName}\nApplied: ${entry.createdAt}\n\nUndo only proceeds if the target still matches the journaled post-operation checksum.`,
		);
		if (!confirmed) return { ok: false, message: "Undo was not approved." };
		try {
			await this.journal!.undo(entry);
			await this.record({
				operationDigest: entry.operationDigest,
				tool: "permission_undo",
				computedFloor: "medium",
				effectiveRisk: "medium",
				decision: "undone",
				reversible: true,
				approval: "confirmed",
				reason: "Restored the most recent checksum-safe journaled mutation.",
			});
			return { ok: true, message: `Restored ${this.journal!.label(entry)} from its journaled pre-image.` };
		} catch (error) {
			return { ok: false, message: (error as Error).message };
		}
	}
}
