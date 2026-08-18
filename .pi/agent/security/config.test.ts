import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseCommandListEntry } from "./bash-policy.ts";
import { FALLBACK_POLICY, loadPermissionPolicy } from "./config.ts";

function validPolicy() {
	return {
		version: 2,
		testedPiVersion: "0.83.0",
		defaultAutonomy: "off",
		commandAllowlist: ["git status"],
		commandDenylist: ["git log"],
		commandBlocklist: ["git push"],
		limits: {
			maxTextFileBytes: 1,
			maxOperationBytes: 1,
			maxMediumFilesPerSession: 1,
			maxMediumSnapshotBytesPerSession: 1,
			maxGitDiffBytes: 1,
		},
	};
}

async function policyDirectory(content?: string) {
	const directory = await mkdtemp(join(tmpdir(), "pi-permission-config-"));
	if (content !== undefined) await writeFile(join(directory, "permission-policy.json"), content);
	return directory;
}

test("loads a complete version-2 policy and compiles its literal command lists once", async () => {
	const directory = await policyDirectory(JSON.stringify(validPolicy()));
	const loaded = await loadPermissionPolicy(directory);
	const status = parseCommandListEntry("git status");
	const log = parseCommandListEntry("git log");
	const push = parseCommandListEntry("git push");

	assert.equal(loaded.error, undefined);
	assert.equal(loaded.policy.defaultAutonomy, "off");
	assert.equal(loaded.policy.limits.maxGitDiffBytes, 1);
	assert.equal(loaded.commandPolicy.allowlist.has(status!.key), true);
	assert.equal(loaded.commandPolicy.denylist.has(log!.key), true);
	assert.equal(loaded.commandPolicy.blocklist.has(push!.key), true);
});

test("fails closed for absent, malformed, legacy, and invalid policy shapes", async () => {
	const valid = validPolicy();
	const cases: Array<[string, string | object | undefined]> = [
		["missing", undefined],
		["malformed", "{not-json"],
		["version one", { ...valid, version: 1 }],
		["invalid mode", { ...valid, defaultAutonomy: "auto" }],
		["non-array list", { ...valid, commandAllowlist: "git status" }],
		["non-string entry", { ...valid, commandAllowlist: ["git status", 7] }],
		["unsupported policy key", { ...valid, unexpected: true }],
		["unsupported limits key", { ...valid, limits: { ...valid.limits, unexpected: true } }],
		["invalid limit", { ...valid, limits: { ...valid.limits, maxGitDiffBytes: 0 } }],
		["non-finite limit", { ...valid, limits: { ...valid.limits, maxGitDiffBytes: Number.POSITIVE_INFINITY } }],
		["path executable", { ...valid, commandAllowlist: ["/usr/bin/git status"] }],
		["wrapper", { ...valid, commandAllowlist: ["env git status"] }],
		["assignment", { ...valid, commandAllowlist: ["MODE=1 git status"] }],
		["redirection", { ...valid, commandAllowlist: ["git status > output"] }],
		["compound command", { ...valid, commandAllowlist: ["git status && git log"] }],
		["dynamic token", { ...valid, commandAllowlist: ["git status $HOME"] }],
		["glob token", { ...valid, commandAllowlist: ["git status *"] }],
	];

	for (const [label, content] of cases) {
		const directory = await policyDirectory(content === undefined ? undefined : typeof content === "string" ? content : JSON.stringify(content));
		const loaded = await loadPermissionPolicy(directory);
		assert.equal(loaded.policy, FALLBACK_POLICY, label);
		assert.equal(loaded.policy.defaultAutonomy, "off", label);
		assert.match(loaded.error ?? "", /Permission policy unavailable/, label);
	}
});

test("uses a checked fallback when the policy path is a directory", async () => {
	const directory = await policyDirectory();
	await mkdir(join(directory, "permission-policy.json"));
	const loaded = await loadPermissionPolicy(directory);

	assert.equal(loaded.policy, FALLBACK_POLICY);
	assert.equal(loaded.commandPolicy.allowlist.has(parseCommandListEntry("git status")!.key), false);
});
