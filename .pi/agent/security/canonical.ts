import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { CanonicalPath } from "./types.ts";

const PROTECTED_DIRECTORY_NAMES: Record<string, true> = {
	".aws": true,
	".docker": true,
	".gnupg": true,
	".kube": true,
	".password-store": true,
	".ssh": true,
};

const PRIVATE_KEY_NAMES: Record<string, true> = {
	id_dsa: true,
	id_ecdsa: true,
	id_ed25519: true,
	id_rsa: true,
};

export function isProtectedResource(resource: CanonicalPath) {
	const segments = resource.relativePath.split(sep).filter(Boolean);
	const leaf = basename(resource.absolutePath).toLowerCase();
	if (segments.some((segment) => PROTECTED_DIRECTORY_NAMES[segment.toLowerCase()] || segment.toLowerCase() === ".git")) return true;
	if (leaf === ".env" || leaf.startsWith(".env.")) return true;
	if (PRIVATE_KEY_NAMES[leaf] || /\.(?:key|pem|p12|pfx|kdbx)$/i.test(leaf)) return true;
	if ([".netrc", ".npmrc", ".pypirc", "credentials", "credentials.json", "auth.json", "secrets.json"].includes(leaf)) return true;

	const normalized = resource.absolutePath.replace(/\\/g, "/").toLowerCase();
	return (
		normalized.endsWith("/.pi/agent/auth.json") ||
		normalized.endsWith("/.pi/agent/models-store.json") ||
		normalized.endsWith("/.config/gcloud/application_default_credentials.json")
	);
}

export function isProtectedPathPattern(value: string) {
	const normalized = value.replace(/\\/g, "/").replace(/^[@!]/, "").toLowerCase();
	const segments = normalized.split("/").filter(Boolean);
	const leaf = segments.at(-1) ?? "";
	if (segments.some((segment) => PROTECTED_DIRECTORY_NAMES[segment] || segment === ".git" || /^\.env(?:\.|$|[*?\[\]{}])/.test(segment))) return true;
	if (PRIVATE_KEY_NAMES[leaf] || /\.(?:key|pem|p12|pfx|kdbx)$/.test(leaf)) return true;
	return [".netrc", ".npmrc", ".pypirc", "credentials", "credentials.json", "auth.json", "secrets.json"].includes(leaf);
}

export class PathResolutionError extends Error {
	readonly code: "ambiguous" | "outside-workspace" | "io";

	constructor(code: "ambiguous" | "outside-workspace" | "io", message: string) {
		super(message);
		this.code = code;
	}
}

function hasGlobSyntax(value: string): boolean {
	return /[*?\[\]{}]/.test(value);
}

function hasParentTraversal(value: string): boolean {
	return value.split(/[\\/]+/).some((part) => part === "..");
}

async function tryLstat(path: string) {
	try {
		return await lstat(path);
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

function isWithin(workspace: string, candidate: string): boolean {
	const pathFromWorkspace = relative(workspace, candidate);
	return pathFromWorkspace === "" || (!pathFromWorkspace.startsWith(`..${sep}`) && pathFromWorkspace !== ".." && !isAbsolute(pathFromWorkspace));
}

async function rejectSymlinkComponents(workspace: string, existingPath: string): Promise<void> {
	const parts = relative(workspace, existingPath).split(sep).filter(Boolean);
	let current = workspace;
	for (const part of parts) {
		current = resolve(current, part);
		const stats = await lstat(current);
		if (stats.isSymbolicLink()) {
			throw new PathResolutionError("ambiguous", "Symlinked paths are not permitted.");
		}
	}
}

/**
 * Canonicalize a tool path without accepting lexical aliases, globs, parent
 * traversals, or symlinks. New files are resolved through their nearest real
 * parent so containment is based on filesystem identities, not string prefixes.
 */
export async function canonicalizePath(requestedPath: unknown, cwd: string): Promise<CanonicalPath> {
	if (typeof requestedPath !== "string" || requestedPath.trim() === "") {
		throw new PathResolutionError("ambiguous", "A non-empty path is required.");
	}

	const rawPath = requestedPath.startsWith("@") ? requestedPath.slice(1) : requestedPath;
	if (
		rawPath.includes("\0") ||
		rawPath.startsWith("~") ||
		hasParentTraversal(rawPath) ||
		hasGlobSyntax(rawPath)
	) {
		throw new PathResolutionError("ambiguous", "Path aliases and globs are not permitted.");
	}

	let workspace: string;
	try {
		workspace = await realpath(cwd);
	} catch (error) {
		throw new PathResolutionError("io", `Unable to resolve workspace: ${(error as Error).message}`);
	}

	const lexicalPath = resolve(workspace, rawPath);
	if (!isWithin(workspace, lexicalPath)) {
		throw new PathResolutionError("outside-workspace", "Path is outside the active workspace.");
	}

	let nearestExistingPath = lexicalPath;
	const missingSegments: string[] = [];
	let stats = await tryLstat(nearestExistingPath);
	while (!stats) {
		const parent = dirname(nearestExistingPath);
		if (parent === nearestExistingPath || !isWithin(workspace, parent)) {
			throw new PathResolutionError("outside-workspace", "Path cannot be resolved within the workspace.");
		}
		missingSegments.unshift(basename(nearestExistingPath));
		nearestExistingPath = parent;
		stats = await tryLstat(nearestExistingPath);
	}

	try {
		await rejectSymlinkComponents(workspace, nearestExistingPath);
		const realParent = await realpath(nearestExistingPath);
		if (!isWithin(workspace, realParent)) {
			throw new PathResolutionError("outside-workspace", "Resolved path is outside the active workspace.");
		}
		const absolutePath = resolve(realParent, ...missingSegments);
		if (!isWithin(workspace, absolutePath)) {
			throw new PathResolutionError("outside-workspace", "Resolved path is outside the active workspace.");
		}

		const targetStats = missingSegments.length === 0 ? stats : undefined;
		return {
			requestedPath,
			workspace,
			absolutePath,
			relativePath: relative(workspace, absolutePath) || ".",
			exists: targetStats !== undefined,
			missingSegments,
			isFile: targetStats?.isFile() ?? false,
			isDirectory: targetStats?.isDirectory() ?? false,
			size: targetStats?.isFile() ? targetStats.size : undefined,
		};
	} catch (error) {
		if (error instanceof PathResolutionError) throw error;
		throw new PathResolutionError("io", `Unable to resolve path: ${(error as Error).message}`);
	}
}
function searchPathRoot(rawPath: string) {
	const firstGlob = rawPath.search(/[*?\[\]{}]/);
	const prefix = rawPath.slice(0, firstGlob);
	const separator = Math.max(prefix.lastIndexOf("/"), prefix.lastIndexOf("\\"));
	if (separator < 0) return ".";
	const root = prefix.slice(0, separator);
	return root || (prefix.startsWith("/") ? "/" : ".");
}

export async function canonicalizeSearchPath(requestedPath: unknown, cwd: string): Promise<CanonicalPath> {
	if (typeof requestedPath !== "string" || requestedPath.trim() === "") {
		throw new PathResolutionError("ambiguous", "A non-empty search path is required.");
	}
	const rawPath = requestedPath.startsWith("@") ? requestedPath.slice(1) : requestedPath;
	if (!hasGlobSyntax(rawPath)) return canonicalizePath(requestedPath, cwd);
	if (rawPath.includes("\0") || rawPath.startsWith("~") || hasParentTraversal(rawPath) || isProtectedPathPattern(rawPath)) {
		throw new PathResolutionError("ambiguous", "Protected, aliased, or traversing search paths are not permitted.");
	}
	const resource = await canonicalizePath(searchPathRoot(rawPath), cwd);
	if (resource.exists && !resource.isDirectory) {
		throw new PathResolutionError("ambiguous", "Globbed search roots must resolve to directories.");
	}
	return { ...resource, requestedPath };
}



export function sha256(value: string | Buffer): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function stableJson(value: unknown): string {
	if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error("Operation input must contain finite JSON numbers.");
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		const entries = Object.keys(record)
			.filter((key) => record[key] !== undefined)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
		return `{${entries.join(",")}}`;
	}
	throw new Error("Operation input must be JSON-compatible.");
}

export function isTextBuffer(content: Buffer): boolean {
	if (content.includes(0)) return false;
	const decoded = content.toString("utf8");
	return Buffer.from(decoded, "utf8").equals(content);
}

export function isTextString(content: unknown): content is string {
	return typeof content === "string" && !content.includes("\0");
}
