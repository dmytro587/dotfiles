import { AuditRecorder, redactText } from "./audit.ts";
import { type CompiledCommandPolicy } from "./bash-policy.ts";
import { FalsePositiveJournal } from "./false-positive-journal.ts";
import { stableJson } from "./canonical.ts";
import { ReversibilityJournal, type JournalEntry } from "./journal.ts";
import { assess } from "./policy.ts";
import { GitShieldScanner, type ShieldScanner } from "./shield.ts";
import {
	autonomyRank,
	isAutonomyMode,
	stricterAutonomyMode,
	type Assessment,
	type AuditEvent,
	type AutonomyMode,
	type OperationApproval,
	type PermissionPolicyConfig,
} from "./types.ts";

export interface PermissionUi {
	hasUI: boolean;
	confirm(title: string, message: string): Promise<boolean>;
	approveOperation?(title: string, message: string): Promise<OperationApproval | undefined>;
	persistMode?(mode: AutonomyMode): Promise<boolean>;
}

export interface GateSession {
	sessionId: string;
	cwd: string;
}

export interface GateOptions {
	agentDirectory: string;
	policy: PermissionPolicyConfig;
	commandPolicy: CompiledCommandPolicy;
	policyRevision: string;
	shieldScanner?: ShieldScanner;
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
	approval: AuditEvent["approval"];
}

function operationPreview(call: ToolCall, assessment: Assessment) {
	if (assessment.canonicalToolName === "bash" && typeof call.input.command === "string") {
		return `Command: ${redactText(call.input.command.slice(0, 400))}`;
	}
	if (assessment.resource) {
		if (assessment.canonicalToolName === "edit" || assessment.canonicalToolName === "write") {
			return `Target: ${assessment.resource.relativePath}\nMutation payload: ${Buffer.byteLength(stableJson(call.input), "utf8")} bytes`;
		}
		return `Target: ${assessment.resource.relativePath}`;
	}
	return "Target: custom or external tool operation";
}

export class PermissionGate {
	private readonly options: GateOptions;
	private readonly audit: AuditRecorder;
	private readonly pendingMutations = new Map<string, PendingMutation>();
	private readonly falsePositiveJournal: FalsePositiveJournal;
	private readonly shieldScanner: ShieldScanner;
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
		this.shieldScanner = options.shieldScanner ?? new GitShieldScanner();
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
		this.mode = this.options.policy.defaultAutonomy;
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
			commandPolicy: this.options.commandPolicy,
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
		reason = assessment.reason,
	): Promise<void> {
		await this.record({
			operationDigest: assessment.operationDigest,
			resourceDigest: assessment.resourceDigest,
			tool: assessment.toolName,
			computedFloor: assessment.floor,
			effectiveRisk: assessment.floor,
			decision,
			reversible: assessment.reversible,
			approval,
			reason,
		});
	}

	private checkSubagentInheritance(assessment: Assessment): string | undefined {
		if (this.inheritedRevisionMismatch && assessment.floor === "high") {
			return "High-risk work is denied because this subagent did not inherit the active policy revision.";
		}
		return undefined;
	}

	private async scanShieldPlans(assessment: Assessment): Promise<string | undefined> {
		if (!this.session) return "Permission gate has not initialized its session state.";
		const seen = new Set<string>();
		for (const plan of assessment.shieldPlans) {
			const key = JSON.stringify([plan.kind, ...plan.args]);
			if (seen.has(key)) continue;
			seen.add(key);
			let scan;
			try {
				scan = await this.shieldScanner.scan(plan, this.session.cwd, this.options.policy.limits.maxGitDiffBytes);
			} catch {
				return plan.kind === "push"
					? "unable to establish a bounded push range"
					: "unable to establish a bounded Git diff";
			}
			if (!scan.ok) return scan.reason;
		}
	}

	private allowsAutomatic(assessment: Assessment) {
		if (assessment.forceConfirmation) return false;
		if (this.mode === "off") return assessment.offAllowed;
		return autonomyRank(assessment.floor) <= autonomyRank(this.mode);
	}

	private async recordHighAllowOnce(assessment: Assessment): Promise<string | undefined> {
		if (assessment.floor !== "high") return;
		try {
			await this.falsePositiveJournal.record({
				schemaVersion: 1,
				kind: "deterministic-high-allow-once",
				timestamp: new Date().toISOString(),
				sessionId: this.session!.sessionId,
				operationDigest: assessment.operationDigest,
				resourceDigest: assessment.resourceDigest,
				computedFloor: "high",
				computedReason: redactText(assessment.reason),
				mode: this.mode,
				policyRevision: this.options.policyRevision,
				userDisposition: "allow-once",
			});
		} catch {
			return "High-risk Allow once was blocked because its audit journal could not be written.";
		}
	}

	private async requestDirectApproval(
		assessment: Assessment,
		call: ToolCall,
		ui: PermissionUi | undefined,
	): Promise<{ approval: "allow-once" | "allow-always" } | { reason: string }> {
		if (!ui?.hasUI || !ui.approveOperation) return { reason: "Operation requires an interactive approval UI." };
		const selected = await ui.approveOperation(
			"Allow Pi operation?",
			`Tool: ${assessment.canonicalToolName}\n${operationPreview(call, assessment)}\nRisk: ${assessment.floor}\nReason: ${redactText(assessment.reason)}`,
		);
		if (selected !== "allow-once" && selected !== "allow-always") return { reason: "Operation was rejected." };
		if (selected === "allow-always") {
			if (!ui.persistMode) return { reason: "Allow always could not persist the session autonomy level." };
			const nextMode = stricterAutonomyMode(this.mode, assessment.floor);
			let persisted = false;
			try {
				persisted = await ui.persistMode(nextMode);
			} catch {
				persisted = false;
			}
			if (!persisted) return { reason: "Allow always could not persist the session autonomy level." };
			this.mode = nextMode;
			return { approval: "allow-always" };
		}
		const journalFailure = await this.recordHighAllowOnce(assessment);
		if (journalFailure) return { reason: journalFailure };
		return { approval: "allow-once" };
	}

	async handleToolCall(call: ToolCall, ui?: PermissionUi): Promise<{ block: true; reason: string } | undefined> {
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
		const shieldFailure = await this.scanShieldPlans(assessment);
		if (shieldFailure) {
			await this.recordAssessment(assessment, "blocked-shield", "denied", `Git Shield blocked this operation: ${shieldFailure}.`);
			return { block: true, reason: shieldFailure };
		}

		let approval: AuditEvent["approval"] = "not-required";
		if (!this.allowsAutomatic(assessment)) {
			const direct = await this.requestDirectApproval(assessment, call, ui);
			if ("reason" in direct) {
				await this.recordAssessment(assessment, "denied-direct-approval", "denied");
				return { block: true, reason: direct.reason };
			}
			approval = direct.approval;
		}

		if (assessment.journalAdapter === "none") {
			await this.recordAssessment(assessment, "allowed", approval);
			return undefined;
		}
		try {
			const journalEntry = await this.journal!.begin({
				operationDigest: assessment.operationDigest,
				toolName: call.toolName as "edit" | "write",
				resource: assessment.resource!,
			});
			this.pendingMutations.set(call.toolCallId, { assessment, journalEntry, approval });
			this.mediumBudget = await this.journal!.usage();
			await this.recordAssessment(assessment, "allowed", approval);
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
			pending.approval,
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
				approval: "allow-once",
				reason: "Restored the most recent checksum-safe journaled mutation.",
			});
			return { ok: true, message: `Restored ${this.journal!.label(entry)} from its journaled pre-image.` };
		} catch (error) {
			return { ok: false, message: (error as Error).message };
		}
	}
}
