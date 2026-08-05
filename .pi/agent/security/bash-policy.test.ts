import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assessBashCommand } from "./bash-policy.ts";
import { GH_2_89_0_COMMANDS, GH_REFERENCE_VERSION } from "./gh-policy.ts";

async function classify(command: string) {
	return assessBashCommand(command, await mkdtemp(join(tmpdir(), "pi-permission-bash-policy-")));
}

test("classifies control operators and literal nested shell payloads without running them", async () => {
	for (const command of [
		"git status && rm -rf temporary",
		"false || git reset --hard",
		"git status | rm -rf temporary",
		"sh -c 'rm -rf temporary'",
		"kubectl exec pod -- rm -rf temporary",
		"docker exec container rm -rf temporary",
		"ssh host 'rm -rf temporary'",
	]) {
		const result = await classify(command);
		assert.equal(result.floor, "high", command);
		assert.equal(result.hardDeny, true, command);
	}
});

test("rejects ambiguous shell syntax and protects redirect targets", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-bash-redirect-"));
	assert.equal((await assessBashCommand("echo result > output.txt", workspace)).floor, "medium");

	for (const command of ["echo $(date)", "echo 'unterminated", "echo secret > .env", "echo data > /dev/null"]) {
		const result = await assessBashCommand(command, workspace);
		assert.equal(result.floor, "high", command);
		assert.equal(result.hardDeny, command.includes("> .env") || command.includes("/dev/null"), command);
	}
});

function githubCommand(path: string) {
	const argumentsByPath: Record<string, string> = {
		"attestation download": "artifact.bin --repo cli/cli",
		"attestation verify": "artifact.bin --repo cli/cli",
		"codespace cp": "codespace:/tmp/log output.txt",
		"gist clone": "octocat clone-target",
		"release download": "--dir release-assets",
		"repo clone": "cli/cli clone-target",
		"release verify-asset": "asset.bin",
		"run download": "--dir run-artifacts",
	};
	return `gh ${path}${argumentsByPath[path] ? ` ${argumentsByPath[path]}` : ""}`;
}

test("classifies every documented GitHub CLI command and its safety overrides", async () => {
	const entries = Object.entries(GH_2_89_0_COMMANDS);
	assert.equal(GH_REFERENCE_VERSION, "2.89.0");
	assert.equal(entries.length, 214);

	for (const [path, floor] of entries) {
		const command = githubCommand(path);
		const result = await classify(command);
		assert.equal(result.floor, floor, command);
	}

	for (const [command, floor, hardDeny] of [
		["gh browse --no-browser", "low", false],
		["gh repo set-default --view", "low", false],
		["gh pr view 1 --web", "high", false],
		["gh issue list --web", "high", false],
		["gh pr checkout 1 --force", "high", true],
		["gh auth status --show-token", "high", true],
		["gh auth token", "high", true],
		["gh extension arbitrary-command", "high", false],
		["gh custom-alias inspect", "high", false],
		["gh pr co 1", "medium", false],
		["gh repo gitignore ls", "low", false],
		["gh rs ls", "low", false],
		["gh repo clone cli/cli -- --config=core.hooksPath=.hooks", "high", false],
		["gh release download --dir ../outside", "high", true],
		["gh release download --output", "high", false],
		["gh auth status -t=token", "high", true],
		["gh run download --dir", "high", false],
	] as const) {
		const result = await classify(command);
		assert.equal(result.floor, floor, command);
		assert.equal(result.hardDeny, hardDeny, command);
	}
});

test("keeps the GitHub command reason when no redirection is present", async () => {
	const result = await classify("gh pr diff 2955 --repo cli/cli --color=never");
	assert.equal(result.reason, "Known GitHub CLI inspection is read-only.");
});

test("rejects unsafe GitHub executable, alias, credential, and path forms", async () => {
	for (const [command, hardDeny] of [
		["./gh pr view 1", false],
		["gh exfil --help", false],
		["GH_TOKEN=ghp_secret gh pr view 1", false],
		["GITHUB_TOKEN=ghp_secret gh pr view 1", false],
		["GH_ENTERPRISE_TOKEN=ghp_secret gh pr view 1", false],
		["GITHUB_ENTERPRISE_TOKEN=ghp_secret gh pr view 1", false],
		["gh release download v1 --dir safe --dir ../outside", false],
		["gh release download v1 --dir safe -D../outside", false],
		["gh release download v1 --output safe -O../outside", false],
		["gh run download --dir safe -D../outside", false],
		["gh release download v1 --output .git/config --clobber", true],
		["gh attestation download ../outside.bin --repo cli/cli", true],
		["gh attestation verify ../outside.bin --repo cli/cli", true],
		["gh attestation verify artifact.bin --bundle ../bundle.jsonl --repo cli/cli", true],
		["gh attestation verify artifact.bin --custom-trusted-root ../root.jsonl --repo cli/cli", true],
		["gh release verify-asset v1 ../outside.bin", true],
	] as const) {
		const result = await classify(command);
		assert.equal(result.floor, "high", command);
		assert.equal(result.hardDeny, hardDeny, command);
	}
});

test("allows bounded GitHub attestation and release verification inputs", async () => {
	assert.equal((await classify("gh pr view --help")).floor, "low");
	for (const command of [
		"gh attestation download oci://registry.example/image:tag --repo cli/cli",
		"gh attestation verify artifact.bin --bundle bundle.jsonl --custom-trusted-root root.jsonl --repo cli/cli",
		"gh attestation verify oci://registry.example/image:tag --repo cli/cli",
		"gh release verify-asset v1 asset.bin",
		"gh release verify-asset asset.bin",
	]) {
		assert.equal((await classify(command)).floor, "medium", command);
	}
});
