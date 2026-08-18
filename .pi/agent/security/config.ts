import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { compileCommandPolicy, type CompiledCommandPolicy } from "./bash-policy.ts";
import { sha256, stableJson } from "./canonical.ts";
import { isAutonomyMode, type PermissionPolicyConfig } from "./types.ts";

export const FALLBACK_POLICY: PermissionPolicyConfig = {
	version: 2,
	testedPiVersion: "0.83.0",
	defaultAutonomy: "off",
	commandAllowlist: [],
	commandDenylist: [],
	commandBlocklist: [],
	limits: {
		maxTextFileBytes: 256 * 1024,
		maxOperationBytes: 64 * 1024,
		maxMediumFilesPerSession: 25,
		maxMediumSnapshotBytesPerSession: 2 * 1024 * 1024,
		maxGitDiffBytes: 1_048_576,
	},
};

const FALLBACK_COMMAND_POLICY = compileCommandPolicy(FALLBACK_POLICY);
const POLICY_KEYS: Record<string, true> = {
	version: true,
	testedPiVersion: true,
	defaultAutonomy: true,
	commandAllowlist: true,
	commandDenylist: true,
	commandBlocklist: true,
	limits: true,
};
const LIMIT_KEYS: Record<string, true> = {
	maxTextFileBytes: true,
	maxOperationBytes: true,
	maxMediumFilesPerSession: true,
	maxMediumSnapshotBytesPerSession: true,
	maxGitDiffBytes: true,
};

export interface LoadedPolicy {
	policy: PermissionPolicyConfig;
	commandPolicy: CompiledCommandPolicy;
	revision: string;
	error?: string;
}

function positiveFinite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parsePolicy(value: unknown): PermissionPolicyConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Policy must be a version-2 object without unsupported keys.");
	}
	const policy = value as Record<string, unknown>;
	if (!Object.keys(policy).every((key) => POLICY_KEYS[key]) || policy.version !== 2) {
		throw new Error("Policy must be a version-2 object without unsupported keys.");
	}
	if (!policy.limits || typeof policy.limits !== "object" || Array.isArray(policy.limits)) {
		throw new Error("Policy has an unsupported shape or invalid limit.");
	}
	const limits = policy.limits as Record<string, unknown>;
	if (
		typeof policy.testedPiVersion !== "string" ||
		policy.testedPiVersion.trim() === "" ||
		!isAutonomyMode(policy.defaultAutonomy) ||
		!isStringArray(policy.commandAllowlist) ||
		!isStringArray(policy.commandDenylist) ||
		!isStringArray(policy.commandBlocklist) ||
		!Object.keys(limits).every((key) => LIMIT_KEYS[key]) ||
		!positiveFinite(limits.maxTextFileBytes) ||
		!positiveFinite(limits.maxOperationBytes) ||
		!positiveFinite(limits.maxMediumFilesPerSession) ||
		!positiveFinite(limits.maxMediumSnapshotBytesPerSession) ||
		!positiveFinite(limits.maxGitDiffBytes)
	) {
		throw new Error("Policy has an unsupported shape or invalid limit.");
	}
	return {
		version: 2,
		testedPiVersion: policy.testedPiVersion,
		defaultAutonomy: policy.defaultAutonomy,
		commandAllowlist: policy.commandAllowlist,
		commandDenylist: policy.commandDenylist,
		commandBlocklist: policy.commandBlocklist,
		limits: {
			maxTextFileBytes: limits.maxTextFileBytes,
			maxOperationBytes: limits.maxOperationBytes,
			maxMediumFilesPerSession: limits.maxMediumFilesPerSession,
			maxMediumSnapshotBytesPerSession: limits.maxMediumSnapshotBytesPerSession,
			maxGitDiffBytes: limits.maxGitDiffBytes,
		},
	};
}

export async function loadPermissionPolicy(agentDirectory: string): Promise<LoadedPolicy> {
	const path = join(agentDirectory, "permission-policy.json");
	try {
		const source = await readFile(path, "utf8");
		const policy = parsePolicy(JSON.parse(source));
		const commandPolicy = compileCommandPolicy(policy);
		return { policy, commandPolicy, revision: sha256(stableJson(policy)) };
	} catch (error) {
		return {
			policy: FALLBACK_POLICY,
			commandPolicy: FALLBACK_COMMAND_POLICY,
			revision: "sha256:policy-unavailable",
			error: `Permission policy unavailable: ${(error as Error).message}`,
		};
	}
}
