export const RISK_CLASSES = ["low", "medium", "high"] as const;
export type RiskClass = (typeof RISK_CLASSES)[number];

export const AUTONOMY_MODES = ["off", "low", "medium", "high"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];
export type OperationApproval = "allow-once" | "allow-always" | "deny";

export interface ShieldPlan {
	kind: "commit" | "push";
	args: readonly string[];
}

export interface PermissionPolicyConfig {
	version: 2;
	testedPiVersion: string;
	defaultAutonomy: AutonomyMode;
	commandAllowlist: string[];
	commandDenylist: string[];
	commandBlocklist: string[];
	limits: {
		maxTextFileBytes: number;
		maxOperationBytes: number;
		maxMediumFilesPerSession: number;
		maxMediumSnapshotBytesPerSession: number;
		maxGitDiffBytes: number;
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
	offAllowed: boolean;
	forceConfirmation: boolean;
	shieldPlans: readonly ShieldPlan[];
	reason: string;
	resource?: CanonicalPath;
	resourceDigest?: string;
	operationDigest: string;
	workspace: string;
	predictedSnapshotBytes: number;
}

export interface AuditEvent {
	timestamp: string;
	sessionId: string;
	operationDigest: string;
	resourceDigest?: string;
	tool: string;
	computedFloor: RiskClass;
	effectiveRisk: RiskClass;
	mode: AutonomyMode;
	decision: string;
	approval: "not-required" | "allow-once" | "allow-always" | "denied";
	policyRevision: string;
	reason: string;
	reversible: boolean;
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

export function autonomyRank(mode: AutonomyMode) {
	return AUTONOMY_MODES.indexOf(mode);
}

export function stricterAutonomyMode(mode: AutonomyMode, risk: RiskClass) {
	return autonomyRank(mode) >= autonomyRank(risk) ? mode : risk;
}

export function riskRank(risk: RiskClass) {
	return RISK_CLASSES.indexOf(risk);
}

export function maxRisk(left: RiskClass, right: RiskClass) {
	return riskRank(left) >= riskRank(right) ? left : right;
}
