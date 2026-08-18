import { spawn } from "node:child_process";
import type { ShieldPlan } from "./types.ts";

export type GitDiffReadResult =
	| { ok: true; diff: string }
	| { ok: false; failure: "diff" | "push-range" };

export type ShieldScanResult =
	| { ok: true; reason: "no-sensitive-patterns" }
	| {
		ok: false;
		reason:
			| "staged private-key pattern"
			| "outgoing private-key pattern"
			| "staged credential-like assignment"
			| "outgoing credential-like assignment"
			| "unable to establish a bounded Git diff"
			| "unable to establish a bounded push range";
	};

export interface GitDiffReader {
	read(plan: ShieldPlan, cwd: string, maxBytes: number): Promise<GitDiffReadResult>;
}

export interface ShieldScanner {
	scan(plan: ShieldPlan, cwd: string, maxBytes: number): Promise<ShieldScanResult>;
}

export type GitCommandResult =
	| { ok: true; stdout: string }
	| { ok: false; code: number | null; overflow: boolean };

export interface GitCommandRunner {
	run(cwd: string, args: string[], maxBytes: number): Promise<GitCommandResult>;
}

type PushTarget = {
	remote: string;
	localRef: string;
	branch: string;
};

const GIT_ENV = {
	GIT_ATTR_NOSYSTEM: "1",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_OPTIONAL_LOCKS: "0",
	HOME: process.env.HOME ?? "",
	LANG: "C",
	LC_ALL: "C",
	PATH: "/usr/bin:/bin",
};

function runGit(cwd: string, args: string[], maxBytes: number): Promise<GitCommandResult> {
	const { promise, resolve } = Promise.withResolvers<GitCommandResult>();
	let settled = false;
	let overflow = false;
	let size = 0;
	const chunks: Buffer[] = [];
	const settle = (result: GitCommandResult) => {
		if (settled) return;
		settled = true;
		resolve(result);
	};
	try {
		const child = spawn("/usr/bin/git", args, {
			cwd,
			env: GIT_ENV,
			shell: false,
			stdio: ["ignore", "pipe", "ignore"],
		});
		child.stdout?.on("data", (chunk: Buffer | string) => {
			if (settled || overflow) return;
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			size += buffer.byteLength;
			if (size > maxBytes) {
				overflow = true;
				child.kill();
				return;
			}
			chunks.push(buffer);
		});
		child.once("error", () => settle({ ok: false, code: null, overflow: false }));
		child.once("close", (code) => {
			if (overflow) {
				settle({ ok: false, code, overflow: true });
				return;
			}
			if (code !== 0) {
				settle({ ok: false, code, overflow: false });
				return;
			}
			settle({ ok: true, stdout: Buffer.concat(chunks).toString("utf8") });
		});
	} catch {
		settle({ ok: false, code: null, overflow: false });
	}
	return promise;
}

function validRemote(value: string) {
	return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function validBranch(value: string) {
	return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) &&
		!value.includes("..") &&
		!value.includes("//") &&
		!value.endsWith("/") &&
		!value.endsWith(".lock") &&
		!value.includes("@{") &&
		!/[~^:\\]/.test(value);
}

function commitUsesAll(args: readonly string[]) {
	if (args[0] !== "commit") return;
	let all = false;
	for (let index = 1; index < args.length; index += 1) {
		const argument = args[index]!;
		if (argument === "-a" || argument === "--all") {
			all = true;
			continue;
		}
		if (argument === "-m" || argument === "--message") {
			if (args[index + 1] === undefined) return;
			index += 1;
			continue;
		}
		if (argument.startsWith("-m") && argument.length > 2 || argument.startsWith("--message=")) continue;
		return;
	}
	return all;
}

function explicitPushTarget(args: readonly string[]) {
	if (args[0] !== "push" || args.length !== 3) return;
	const remote = args[1]!;
	const refspec = args[2]!;
	if (!validRemote(remote)) return;
	if (refspec.startsWith("HEAD:")) {
		const branch = refspec.slice("HEAD:".length);
		if (!validBranch(branch)) return;
		return { remote, localRef: "HEAD", branch };
	}
	if (!validBranch(refspec)) return;
	return { remote, localRef: refspec, branch: refspec };
}

function secretLineKind(line: string) {
	if (/-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/i.test(line)) return "private-key";
	if (/\b(?:AKIA|ASIA|AIDA|AROA)[A-Z0-9]{16}\b/.test(line)) return "credential";
	if (/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/i.test(line)) return "credential";
	if (/\bglpat-[A-Za-z0-9_-]{20,}\b/i.test(line)) return "credential";
	if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/i.test(line)) return "credential";
	if (/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/i.test(line)) return "credential";
	if (/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/i.test(line)) return "credential";

	const assignment = /["']?([A-Za-z_]*(?:api[_-]?key|authorization|client[_-]?secret|password|secret|token|private[_-]?key)[A-Za-z0-9_-]*)["']?\s*(?:=|:)\s*["']?([A-Za-z0-9+/_=-]{20,})/i.exec(line);
	if (!assignment) return;
	const value = assignment[2]!;
	const normalized = value.toLowerCase().replace(/[-_]/g, "");
	if (/^(?:example|changeme|redacted)+$/.test(normalized) || /^<[^>]+>$/.test(value) || /^\$\{[^}]+\}$/.test(value)) return;
	const frequencies = new Map<string, number>();
	for (const character of value) frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
	let entropy = 0;
	for (const count of frequencies.values()) {
		const probability = count / value.length;
		entropy -= probability * Math.log2(probability);
	}
	return entropy >= 3.5 ? "credential" : undefined;
}

function hasContentSuppressedDiff(diff: string) {
	return /^(?:Binary files .+ differ|GIT binary patch)$/m.test(diff);
}

export class BoundedGitDiffReader implements GitDiffReader {
	readonly #runner: GitCommandRunner;

	constructor(runner: GitCommandRunner = { run: runGit }) {
		this.#runner = runner;
	}

	async read(plan: ShieldPlan, cwd: string, maxBytes: number): Promise<GitDiffReadResult> {
		if (plan.kind === "commit") return this.readCommit(plan.args, cwd, maxBytes);
		return this.readPush(plan.args, cwd, maxBytes);
	}

	async readCommit(args: readonly string[], cwd: string, maxBytes: number): Promise<GitDiffReadResult> {
		const all = commitUsesAll(args);
		if (all === undefined) return { ok: false, failure: "diff" };
		const command = all
			? ["diff", "HEAD", "--no-ext-diff", "--no-textconv", "--unified=0"]
			: ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--unified=0"];
		const result = await this.#runner.run(cwd, command, maxBytes);
		return result.ok ? { ok: true, diff: result.stdout } : { ok: false, failure: "diff" };
	}

	async readPush(args: readonly string[], cwd: string, maxBytes: number): Promise<GitDiffReadResult> {
		let target: PushTarget | undefined;
		if (args.length === 1 && args[0] === "push") {
			const upstream = await this.#runner.run(cwd, ["rev-parse", "--abbrev-ref", "@{push}"], maxBytes);
			if (!upstream.ok) return { ok: false, failure: "push-range" };
			const [remote, ...branchParts] = upstream.stdout.trim().split("/");
			const branch = branchParts.join("/");
			if (!remote || !validRemote(remote) || !validBranch(branch)) return { ok: false, failure: "push-range" };
			target = { remote, localRef: "HEAD", branch };
		} else {
			target = explicitPushTarget(args);
			if (!target) return { ok: false, failure: "push-range" };
		}
		const local = await this.#runner.run(cwd, ["rev-parse", "--verify", "--quiet", `${target.localRef}^{commit}`], maxBytes);
		if (!local.ok) return { ok: false, failure: "push-range" };
		const remoteRef = `refs/remotes/${target.remote}/${target.branch}`;
		const tracked = await this.#runner.run(cwd, ["rev-parse", "--verify", "--quiet", `${remoteRef}^{commit}`], maxBytes);
		if (tracked.ok) {
			const base = await this.#runner.run(cwd, ["merge-base", remoteRef, target.localRef], maxBytes);
			if (!base.ok || base.stdout.trim() === "") return { ok: false, failure: "push-range" };
			const diff = await this.#runner.run(cwd, ["diff", base.stdout.trim(), target.localRef, "--no-ext-diff", "--no-textconv", "--unified=0"], maxBytes);
			return diff.ok ? { ok: true, diff: diff.stdout } : { ok: false, failure: "push-range" };
		}
		if (tracked.code !== 1) return { ok: false, failure: "push-range" };
		const configuredRemote = await this.#runner.run(cwd, ["remote", "get-url", target.remote], maxBytes);
		if (!configuredRemote.ok || configuredRemote.stdout.trim() === "") return { ok: false, failure: "push-range" };
		const diff = await this.#runner.run(cwd, ["diff", "--root", target.localRef, "--no-ext-diff", "--no-textconv", "--unified=0"], maxBytes);
		return diff.ok ? { ok: true, diff: diff.stdout } : { ok: false, failure: "push-range" };
	}
}

export class GitShieldScanner implements ShieldScanner {
	readonly #reader: GitDiffReader;

	constructor(reader: GitDiffReader = new BoundedGitDiffReader()) {
		this.#reader = reader;
	}

	async scan(plan: ShieldPlan, cwd: string, maxBytes: number): Promise<ShieldScanResult> {
		const read = await this.#reader.read(plan, cwd, maxBytes);
		if (!read.ok) {
			return {
				ok: false,
				reason: read.failure === "push-range"
					? "unable to establish a bounded push range"
					: "unable to establish a bounded Git diff",
			};
		}
		if (hasContentSuppressedDiff(read.diff)) {
			return { ok: false, reason: plan.kind === "push" ? "unable to establish a bounded push range" : "unable to establish a bounded Git diff" };
		}
		for (const line of read.diff.split(/\r?\n/)) {
			if (!line.startsWith("+") || line.startsWith("+++")) continue;
			const kind = secretLineKind(line.slice(1));
			if (!kind) continue;
			if (kind === "private-key") {
				return plan.kind === "push"
					? { ok: false, reason: "outgoing private-key pattern" }
					: { ok: false, reason: "staged private-key pattern" };
			}
			return plan.kind === "push"
				? { ok: false, reason: "outgoing credential-like assignment" }
				: { ok: false, reason: "staged credential-like assignment" };
		}
		return { ok: true, reason: "no-sensitive-patterns" };
	}
}
