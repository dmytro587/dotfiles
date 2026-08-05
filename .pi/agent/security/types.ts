export const RISK_CLASSES = ["low", "medium", "high"] as const;
export type RiskClass = (typeof RISK_CLASSES)[number];

export const AUTONOMY_MODES = ["auto", "low", "medium", "high"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];
export type HighRiskApproval = "allow" | "allow-and-journal" | "deny";

export interface PermissionPolicyConfig {
	version: 1;
	testedPiVersion: string;
	defaultAutonomy: AutonomyMode;
	limits: {
		maxTextFileBytes: number;
		maxOperationBytes: number;
		maxPermitRequestBytes: number;
		permitTtlMs: number;
		maxMediumFilesPerSession: number;
		maxMediumSnapshotBytesPerSession: number;
	};
}

export interface CanonicalPath {
	requestedPath: string;
	workspace: string;
	absolutePath: string;
	relativePath: string;
	exists: boolean;
	missingSegments: string[];
	isFile: boolean;
	isDirectory: boolean;
	size?: number;
}

export interface MediumBudget {
	fileCount: number;
	snapshotBytes: number;
}

export interface Assessment {
	toolName: string;
	canonicalToolName: string;
	floor: RiskClass;
	journalAdapter: "none" | "workspace-text";
	reversible: boolean;
	hardDeny: boolean;
	reason: string;
	resource?: CanonicalPath;
	resourceDigest?: string;
	operationDigest: string;
	workspace: string;
	predictedSnapshotBytes: number;
}

export interface Permit {
	operationDigest: string;
	resourceDigest?: string;
	sessionId: string;
	toolName: string;
	declaredRisk: RiskClass;
	declaredRiskReason: string;
	effectiveRisk: RiskClass;
	approval: "not-required" | "confirmed" | "confirmed-and-journaled" | "mode-high";
	expiresAt: number;
}

export interface PermissionRequest {
	toolName: string;
	input: Record<string, unknown>;
	declaredRisk: RiskClass;
	declaredRiskReason: string;
	intent: string;
	expectedEffect: string;
	rollbackPlan: string;
}

export interface AuditEvent {
	timestamp: string;
	sessionId: string;
	operationDigest: string;
	resourceDigest?: string;
	tool: string;
	declaredRisk?: RiskClass;
	declaredRiskReason?: string;
	computedFloor: RiskClass;
	effectiveRisk: RiskClass;
	mode: AutonomyMode;
	decision: string;
	approval: "not-required" | "confirmed" | "confirmed-and-journaled" | "mode-high" | "denied";
	policyRevision: string;
	reason: string;
}

export function isRiskClass(value: unknown): value is RiskClass {
	return typeof value === "string" && (RISK_CLASSES as readonly string[]).includes(value);
}

export function isAutonomyMode(value: unknown): value is AutonomyMode {
	return typeof value === "string" && (AUTONOMY_MODES as readonly string[]).includes(value);
}

export function nextAutonomyMode(mode: AutonomyMode) {
	const index = AUTONOMY_MODES.indexOf(mode);
	return AUTONOMY_MODES[(index + 1) % AUTONOMY_MODES.length]!;
}

export function riskRank(risk: RiskClass): number {
	return RISK_CLASSES.indexOf(risk);
}

export function maxRisk(left: RiskClass, right: RiskClass): RiskClass {
	return riskRank(left) >= riskRank(right) ? left : right;
}
