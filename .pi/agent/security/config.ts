import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256, stableJson } from "./canonical.ts";
import { isAutonomyMode, type PermissionPolicyConfig } from "./types.ts";

const FALLBACK_POLICY: PermissionPolicyConfig = {
	version: 1,
	testedPiVersion: "0.83.0",
	defaultAutonomy: "auto",
	limits: {
		maxTextFileBytes: 256 * 1024,
		maxOperationBytes: 64 * 1024,
		maxPermitRequestBytes: 64 * 1024,
		permitTtlMs: 5 * 60 * 1000,
		maxMediumFilesPerSession: 25,
		maxMediumSnapshotBytesPerSession: 2 * 1024 * 1024,
	},
};

export interface LoadedPolicy {
	policy: PermissionPolicyConfig;
	revision: string;
	error?: string;
}

function positiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parsePolicy(value: unknown): PermissionPolicyConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Policy must be a JSON object.");
	const policy = value as Partial<PermissionPolicyConfig>;
	const limits = policy.limits as Partial<PermissionPolicyConfig["limits"]> | undefined;
	if (
		policy.version !== 1 ||
		typeof policy.testedPiVersion !== "string" ||
		!isAutonomyMode(policy.defaultAutonomy) ||
		!limits ||
		![
			limits.maxTextFileBytes,
			limits.maxOperationBytes,
			limits.maxPermitRequestBytes,
			limits.permitTtlMs,
			limits.maxMediumFilesPerSession,
			limits.maxMediumSnapshotBytesPerSession,
		].every(positiveInteger)
	) {
		throw new Error("Policy has an unsupported shape or invalid limit.");
	}
	return policy as PermissionPolicyConfig;
}

export async function loadPermissionPolicy(agentDirectory: string): Promise<LoadedPolicy> {
	const path = join(agentDirectory, "permission-policy.json");
	try {
		const source = await readFile(path, "utf8");
		const policy = parsePolicy(JSON.parse(source));
		return { policy, revision: sha256(stableJson(policy)) };
	} catch (error) {
		return {
			policy: FALLBACK_POLICY,
			revision: "sha256:policy-unavailable",
			error: `Permission policy unavailable: ${(error as Error).message}`,
		};
	}
}
