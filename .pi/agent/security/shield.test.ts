import assert from "node:assert/strict";
import test from "node:test";
import {
	BoundedGitDiffReader,
	GitShieldScanner,
	type GitCommandResult,
	type GitCommandRunner,
	type GitDiffReadResult,
	type GitDiffReader,
} from "./shield.ts";
import type { ShieldPlan } from "./types.ts";

class RecordingRunner implements GitCommandRunner {
	readonly calls: Array<{ cwd: string; args: string[]; maxBytes: number }> = [];
	readonly #results: GitCommandResult[];

	constructor(results: GitCommandResult[]) {
		this.#results = [...results];
	}

	async run(cwd: string, args: string[], maxBytes: number) {
		this.calls.push({ cwd, args: [...args], maxBytes });
		return this.#results.shift() ?? { ok: false, code: null, overflow: false };
	}
}

class FakeDiffReader implements GitDiffReader {
	readonly calls: Array<{ plan: ShieldPlan; cwd: string; maxBytes: number }> = [];
	readonly #results: GitDiffReadResult[];

	constructor(results: GitDiffReadResult[]) {
		this.#results = [...results];
	}

	async read(plan: ShieldPlan, cwd: string, maxBytes: number) {
		this.calls.push({ plan, cwd, maxBytes });
		return this.#results.shift() ?? { ok: false, failure: "diff" };
	}
}

test("reads normal and all-file commit diffs through bounded no-shell Git commands", async () => {
	const normalRunner = new RecordingRunner([{ ok: true, stdout: "+safe\n" }]);
	const normal = await new BoundedGitDiffReader(normalRunner).read({ kind: "commit", args: ["commit", "-m", "message"] }, "/workspace", 64);
	assert.deepEqual(normal, { ok: true, diff: "+safe\n" });
	assert.deepEqual(normalRunner.calls, [{
		cwd: "/workspace",
		args: ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--unified=0"],
		maxBytes: 64,
	}]);

	const allRunner = new RecordingRunner([{ ok: true, stdout: "+safe\n" }]);
	const all = await new BoundedGitDiffReader(allRunner).read({ kind: "commit", args: ["commit", "--all", "-m", "message"] }, "/workspace", 64);
	assert.equal(all.ok, true);
	assert.deepEqual(allRunner.calls[0]?.args, ["diff", "HEAD", "--no-ext-diff", "--no-textconv", "--unified=0"]);

	const unsupportedRunner = new RecordingRunner([]);
	const unsupported = await new BoundedGitDiffReader(unsupportedRunner).read({ kind: "commit", args: ["commit", "--amend"] }, "/workspace", 64);
	assert.deepEqual(unsupported, { ok: false, failure: "diff" });
	assert.equal(unsupportedRunner.calls.length, 0);
});

test("derives configured, explicit, and first-push ranges without running a push", async () => {
	const configuredRunner = new RecordingRunner([
		{ ok: true, stdout: "origin/main\n" },
		{ ok: true, stdout: "local\n" },
		{ ok: true, stdout: "remote\n" },
		{ ok: true, stdout: "base\n" },
		{ ok: true, stdout: "+safe\n" },
	]);
	const configured = await new BoundedGitDiffReader(configuredRunner).read({ kind: "push", args: ["push"] }, "/workspace", 64);
	assert.equal(configured.ok, true);
	assert.deepEqual(configuredRunner.calls.map((call) => call.args), [
		["rev-parse", "--abbrev-ref", "@{push}"],
		["rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
		["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"],
		["merge-base", "refs/remotes/origin/main", "HEAD"],
		["diff", "base", "HEAD", "--no-ext-diff", "--no-textconv", "--unified=0"],
	]);

	const explicitRunner = new RecordingRunner([
		{ ok: true, stdout: "local\n" },
		{ ok: true, stdout: "remote\n" },
		{ ok: true, stdout: "base\n" },
		{ ok: true, stdout: "+safe\n" },
	]);
	const explicit = await new BoundedGitDiffReader(explicitRunner).read({ kind: "push", args: ["push", "origin", "feature"] }, "/workspace", 64);
	assert.equal(explicit.ok, true);
	assert.deepEqual(explicitRunner.calls.map((call) => call.args), [
		["rev-parse", "--verify", "--quiet", "feature^{commit}"],
		["rev-parse", "--verify", "--quiet", "refs/remotes/origin/feature^{commit}"],
		["merge-base", "refs/remotes/origin/feature", "feature"],
		["diff", "base", "feature", "--no-ext-diff", "--no-textconv", "--unified=0"],
	]);

	const firstPushRunner = new RecordingRunner([
		{ ok: true, stdout: "local\n" },
		{ ok: false, code: 1, overflow: false },
		{ ok: true, stdout: "https://example.test/repository.git\n" },
		{ ok: true, stdout: "+safe\n" },
	]);
	const firstPush = await new BoundedGitDiffReader(firstPushRunner).read({ kind: "push", args: ["push", "origin", "HEAD:main"] }, "/workspace", 64);
	assert.equal(firstPush.ok, true);
	assert.deepEqual(firstPushRunner.calls.map((call) => call.args), [
		["rev-parse", "--verify", "--quiet", "HEAD^{commit}"],
		["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"],
		["remote", "get-url", "origin"],
		["diff", "--root", "HEAD", "--no-ext-diff", "--no-textconv", "--unified=0"],
	]);
});

test("fails closed before Git range reads for unsupported push forms", async () => {
	for (const args of [
		["push", "origin"],
		["push", "--tags"],
		["push", "origin", "main:release"],
		["push", "origin", ":main"],
		["push", "origin", "main", "release"],
	]) {
		const runner = new RecordingRunner([]);
		const result = await new BoundedGitDiffReader(runner).read({ kind: "push", args }, "/workspace", 64);
		assert.deepEqual(result, { ok: false, failure: "push-range" }, args.join(" "));
		assert.equal(runner.calls.length, 0, args.join(" "));
	}
});

test("scans only added diff lines and recognizes high-confidence secret families", async () => {
	const patterns = [
		"-----BEGIN PRIVATE KEY-----",
		"AKIA1234567890ABCDEF",
		"ghp_abcdefghijklmnopqrstuvwxyz012345",
		"glpat-abcdefghijklmnopqrstuvwxyz012345",
		"sk-proj-abcdefghijklmnopqrstuvwxyz012345",
		"xoxb-1234567890-abcdefghij",
		"sk_live_abcdefghijklmnop",
	];
	for (const pattern of patterns) {
		const reader = new FakeDiffReader([{ ok: true, diff: `+++ b/ignored\n-context ${pattern}\n+value=${pattern}\n` }]);
		const scanner = new GitShieldScanner(reader);
		const result = await scanner.scan({ kind: "commit", args: ["commit"] }, "/workspace", 64);
		assert.equal(result.ok, false, pattern);
		assert.equal(JSON.stringify(result).includes(pattern), false, pattern);
	}
});

test("blocks contextual entropy while accepting non-secret values and placeholders", async () => {
	const entropy = "aB3dE5fG7hI9jK1lM2nO3pQ4rS5tU6vW";
	const reader = new FakeDiffReader([
		{ ok: true, diff: `+API_KEY=${entropy}\n` },
		{ ok: true, diff: `+release_id=${entropy}\n` },
		{ ok: true, diff: "+API_KEY=<REPLACE_ME>\n" },
		{ ok: true, diff: "+API_KEY=\${API_KEY}\n" },
	]);
	const scanner = new GitShieldScanner(reader);

	assert.equal((await scanner.scan({ kind: "push", args: ["push"] }, "/workspace", 64)).ok, false);
	assert.deepEqual(await scanner.scan({ kind: "commit", args: ["commit"] }, "/workspace", 64), { ok: true, reason: "no-sensitive-patterns" });
	assert.deepEqual(await scanner.scan({ kind: "commit", args: ["commit"] }, "/workspace", 64), { ok: true, reason: "no-sensitive-patterns" });
	assert.deepEqual(await scanner.scan({ kind: "commit", args: ["commit"] }, "/workspace", 64), { ok: true, reason: "no-sensitive-patterns" });
});

test("fails closed for content-suppressed, reader-failure, and oversized diff results without exposing source", async () => {
	const secret = "AKIA1234567890ABCDEF";
	const reader = new FakeDiffReader([
		{ ok: true, diff: "" },
		{ ok: true, diff: "Binary files a/secret.bin and b/secret.bin differ\n" },
		{ ok: true, diff: "GIT binary patch\nliteral 20\n" },
		{ ok: false, failure: "diff" },
		{ ok: false, failure: "push-range" },
	]);
	const scanner = new GitShieldScanner(reader);

	assert.deepEqual(await scanner.scan({ kind: "commit", args: ["commit"] }, "/workspace", 64), { ok: true, reason: "no-sensitive-patterns" });
	const suppressedCommit = await scanner.scan({ kind: "commit", args: ["commit"] }, "/workspace", 64);
	assert.deepEqual(suppressedCommit, { ok: false, reason: "unable to establish a bounded Git diff" });
	assert.equal(JSON.stringify(suppressedCommit).includes("secret.bin"), false);
	const suppressedPush = await scanner.scan({ kind: "push", args: ["push"] }, "/workspace", 64);
	assert.deepEqual(suppressedPush, { ok: false, reason: "unable to establish a bounded push range" });
	const oversized = await scanner.scan({ kind: "commit", args: ["commit"] }, "/workspace", 64);
	assert.deepEqual(oversized, { ok: false, reason: "unable to establish a bounded Git diff" });
	assert.equal(JSON.stringify(oversized).includes(secret), false);
	assert.deepEqual(
		await scanner.scan({ kind: "push", args: ["push"] }, "/workspace", 64),
		{ ok: false, reason: "unable to establish a bounded push range" },
	);
	assert.equal(reader.calls.every((call) => call.maxBytes === 64), true);
});
