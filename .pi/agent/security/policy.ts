import { readFile } from "node:fs/promises";
import { sep } from "node:path";
import {
	canonicalizePath,
	canonicalizeSearchPath,
	isProtectedPathPattern,
	isProtectedResource,
	isTextBuffer,
	isTextString,
	PathResolutionError,
	sha256,
	stableJson,
} from "./canonical.ts";
import { assessBashCommand } from "./bash-policy.ts";
import { canonicalToolName } from "./tool-identity.ts";
import type { Assessment, CanonicalPath, MediumBudget, PermissionPolicyConfig, RiskClass } from "./types.ts";

export interface AssessmentContext {
	cwd: string;
	sessionId: string;
	policyRevision: string;
	policy: PermissionPolicyConfig;
	mediumBudget: MediumBudget;
}

const GENERATED_DIRECTORIES = new Set([
	".next",
	".nuxt",
	".terraform",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"out",
	"target",
]);



function recordFrom(input: unknown): Record<string, unknown> {
	return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}


function generatedPath(resource: CanonicalPath): boolean {
	return resource.relativePath.split(sep).some((segment) => GENERATED_DIRECTORIES.has(segment.toLowerCase()));
}


function unsafeFetchReason(input: Record<string, unknown>) {
	const value = input.url;
	if (typeof value !== "string") return "Fetch requests require a literal public http or https URL.";

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return "Fetch requests require a literal public http or https URL.";
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return "Only public http and https URLs are supported.";
	if (url.username || url.password) return "Credential-bearing URLs are outside the permission gate's authority.";

	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	const privateIpv4 = /^(?:0|10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
		/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host) ||
		/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
		/^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
	const mappedPrivateIpv4 = host.startsWith("::ffff:") && /^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./.test(host.slice("::ffff:".length));
	if (host === "localhost" || host.endsWith(".localhost") || privateIpv4 || mappedPrivateIpv4 || host === "::1" || /^fe[89ab][\da-f]*:/i.test(host) || /^f[cd][\da-f]*:/i.test(host)) {
		return "Loopback, link-local, and private network targets are outside the permission gate's authority.";
	}

	const headers = recordFrom(input.headers);
	if (Object.keys(headers).some((name) => /(?:authorization|cookie|token|api[-_]?key|secret|password|credential)/i.test(name))) {
		return "Credential-bearing request headers are outside the permission gate's authority.";
	}
}

function operationDigest(
	toolName: string,
	input: Record<string, unknown>,
	workspace: string,
	sessionId: string,
	policyRevision: string,
): string {
	return sha256(
		stableJson({
			input,
			policyRevision,
			sessionId,
			toolName,
			workspace,
		}),
	);
}

function assessment(
	toolName: string,
	input: Record<string, unknown>,
	context: AssessmentContext,
	floor: RiskClass,
	reason: string,
	overrides: Partial<Pick<Assessment, "hardDeny" | "journalAdapter" | "resource" | "predictedSnapshotBytes">> = {},
): Assessment {
	const canonicalName = canonicalToolName(toolName);
	const journalAdapter = overrides.journalAdapter ?? "none";
	const workspace = overrides.resource?.workspace ?? context.cwd;
	return {
		toolName,
		canonicalToolName: canonicalName,
		floor,
		hardDeny: false,
		reason,
		workspace,
		operationDigest: operationDigest(canonicalName, input, workspace, context.sessionId, context.policyRevision),
		...overrides,
		journalAdapter,
		reversible: journalAdapter === "workspace-text",
		resourceDigest: overrides.resource ? sha256(overrides.resource.absolutePath) : undefined,
		predictedSnapshotBytes: overrides.predictedSnapshotBytes ?? 0,
	};
}

async function resolveResource(
	toolName: string,
	input: Record<string, unknown>,
	context: AssessmentContext,
	pathValue: unknown,
	resolver: typeof canonicalizePath = canonicalizePath,
): Promise<{ resource?: CanonicalPath; rejected?: Assessment }> {
	try {
		const resource = await resolver(pathValue, context.cwd);
		if (isProtectedResource(resource)) {
			return {
				rejected: assessment(toolName, input, context, "high", "Protected data is outside the permission gate's authority.", {
					hardDeny: true,
					resource,
				}),
			};
		}
		return { resource };
	} catch (error) {
		const reason = error instanceof PathResolutionError && error.code === "outside-workspace"
			? "Out-of-workspace paths are outside the permission gate's authority."
			: "Ambiguous, globbed, or symlinked paths are denied.";
		return {
			rejected: assessment(toolName, input, context, "high", reason, { hardDeny: true }),
		};
	}
}

function requestTextBytes(toolName: string, input: Record<string, unknown>): number {
	if (toolName === "write") return Buffer.byteLength(String(input.content ?? ""), "utf8");
	if (toolName !== "edit" || !Array.isArray(input.edits)) return 0;
	return input.edits.reduce((total, edit) => {
		if (!edit || typeof edit !== "object") return total;
		const values = edit as Record<string, unknown>;
		return total + Buffer.byteLength(String(values.oldText ?? ""), "utf8") + Buffer.byteLength(String(values.newText ?? ""), "utf8");
	}, 0);
}

async function assessMutation(
	classificationToolName: "edit" | "write",
	operationToolName: string,
	input: Record<string, unknown>,
	context: AssessmentContext,
	resource: CanonicalPath,
): Promise<Assessment> {
	const { limits } = context.policy;
	const payloadBytes = requestTextBytes(classificationToolName, input);
	if (generatedPath(resource)) return assessment(operationToolName, input, context, "high", "Generated or dependency paths are not Medium mutations.", { resource });
	if (payloadBytes > limits.maxOperationBytes) return assessment(operationToolName, input, context, "high", "Mutation payload exceeds the reversible-operation limit.", { resource });
	if (classificationToolName === "edit" && !resource.exists) return assessment(operationToolName, input, context, "high", "Editing a non-existent file is not a supported reversible operation.", { resource });
	if (resource.exists && !resource.isFile) return assessment(operationToolName, input, context, "high", "Only regular text files are supported reversible mutations.", { resource });
	if (!resource.exists && (classificationToolName !== "write" || resource.missingSegments.length !== 1)) {
		return assessment(operationToolName, input, context, "high", "Creating directory trees is not a supported reversible operation.", { resource });
	}
	if (classificationToolName === "write" && !isTextString(input.content)) {
		return assessment(operationToolName, input, context, "high", "Binary content is not a supported reversible operation.", { resource });
	}
	if (classificationToolName === "edit" && (!Array.isArray(input.edits) || input.edits.some((edit) => {
		if (!edit || typeof edit !== "object") return true;
		const values = edit as Record<string, unknown>;
		return !isTextString(values.oldText) || !isTextString(values.newText);
	}))) {
		return assessment(operationToolName, input, context, "high", "Binary or malformed edits are not supported reversible operations.", { resource });
	}

	let snapshotBytes = 0;
	if (resource.exists) {
		if ((resource.size ?? 0) > limits.maxTextFileBytes) {
			return assessment(operationToolName, input, context, "high", "File exceeds the reversible-operation size limit.", { resource });
		}
		try {
			const preImage = await readFile(resource.absolutePath);
			if (!isTextBuffer(preImage)) {
				return assessment(operationToolName, input, context, "high", "Binary files are not supported reversible mutations.", { resource });
			}
			snapshotBytes = preImage.byteLength;
		} catch {
			return assessment(operationToolName, input, context, "high", "The target cannot be captured for safe reversal.", { resource });
		}
	}

	if (
		context.mediumBudget.fileCount + 1 > limits.maxMediumFilesPerSession ||
		context.mediumBudget.snapshotBytes + snapshotBytes > limits.maxMediumSnapshotBytesPerSession
	) {
		return assessment(operationToolName, input, context, "high", "The session's reversible-mutation budget is exhausted.", { resource });
	}

	return assessment(operationToolName, input, context, "medium", "Workspace text mutation can be journaled and reversed.", {
		resource,
		journalAdapter: "workspace-text",
		predictedSnapshotBytes: snapshotBytes,
	});
}

/** Deterministically classify a Pi tool call from the actual tool name and arguments. */
export async function assess(
	toolName: string,
	inputValue: unknown,
	context: AssessmentContext,
): Promise<Assessment> {
	const input = recordFrom(inputValue);
	const classificationToolName = canonicalToolName(toolName);
	try {
		stableJson(input);
	} catch {
		return assessment(toolName, input, context, "high", "Non-JSON tool arguments are denied.", { hardDeny: true });
	}

	if (classificationToolName === "bash") {
		const command = typeof input.command === "string" ? input.command : "";
		const bash = await assessBashCommand(command, context.cwd);
		return assessment(toolName, input, context, bash.floor, bash.reason, { hardDeny: bash.hardDeny });
	}

	if (classificationToolName === "read") {
		const resolved = await resolveResource(toolName, input, context, input.path);
		if (resolved.rejected) return resolved.rejected;
		return assessment(toolName, input, context, "low", "Workspace read-only operation.", { resource: resolved.resource });
	}

	if (classificationToolName === "grep" || classificationToolName === "find" || classificationToolName === "ls") {
		const path = input.path ?? ".";
		const pattern = typeof input.pattern === "string" ? input.pattern : "";
		const glob = typeof input.glob === "string" ? input.glob : "";
		if (
			pattern.split(/[\\/]+/).some((part) => part === "..") ||
			/(?:^|[\\/])\.env(?:\.|$)/.test(pattern) ||
			/(?:^|[\\/])\.env(?:\.|$)/.test(glob) ||
			(classificationToolName !== "ls" && typeof path === "string" && isProtectedPathPattern(path))
		) {
			return assessment(toolName, input, context, "high", "Protected or ambiguous search roots are denied.", { hardDeny: true });
		}
		const resolved = await resolveResource(
			toolName,
			input,
			context,
			path,
			classificationToolName === "grep" || classificationToolName === "find" ? canonicalizeSearchPath : canonicalizePath,
		);
		if (resolved.rejected) return resolved.rejected;
		return assessment(toolName, input, context, "low", "Workspace read-only search or listing.", { resource: resolved.resource });
	}

	if (classificationToolName === "edit" || classificationToolName === "write") {
		const resolved = await resolveResource(toolName, input, context, input.path);
		if (resolved.rejected) return resolved.rejected;
		return assessMutation(classificationToolName, toolName, input, context, resolved.resource!);
	}

	if (classificationToolName === "todo" || classificationToolName === "wait") {
		return assessment(toolName, input, context, "low", "Session-local coordination operation.");
	}

	if (classificationToolName === "web_search" || classificationToolName === "get_search_content") {
		return assessment(toolName, input, context, "low", "Public search result retrieval is read-only.");
	}

	if (classificationToolName === "fetch_content") {
		const unsafeReason = unsafeFetchReason(input);
		if (unsafeReason) return assessment(toolName, input, context, "high", unsafeReason, { hardDeny: true });
		return assessment(toolName, input, context, "medium", "Public web content retrieval is a bounded external request.");
	}

	if (classificationToolName === "subagent") {
		if (input.action === "status" || input.action === "message") {
			return assessment(toolName, input, context, "low", "Subagent status and message operations do not create a worker.");
		}
		return assessment(toolName, input, context, "high", "Subagent spawns remain High until installed role capabilities prove read-only enforcement.");
	}

	return assessment(toolName, input, context, "high", "Unknown or network-capable custom tools are high risk by default.");
}
