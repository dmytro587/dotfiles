import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assessBashCommand, compileCommandPolicy, parseCommandListEntry } from "./bash-policy.ts";
import { GH_2_89_0_COMMANDS, GH_REFERENCE_VERSION } from "./gh-policy.ts";

async function workspace() {
	return mkdtemp(join(tmpdir(), "pi-permission-bash-policy-"));
}

async function classify(command: string, commandPolicy = compileCommandPolicy({
	commandAllowlist: [],
	commandDenylist: [],
	commandBlocklist: [],
})) {
	return assessBashCommand(command, await workspace(), commandPolicy);
}

test("parses command-list entries as exactly one literal bare segment", () => {
	const parsed = parseCommandListEntry("git status");
	assert.deepEqual(parsed, {
		executable: "git",
		args: ["status"],
		key: JSON.stringify(["git", "status"]),
	});

	for (const entry of [
		"",
		"/usr/bin/git status",
		"command git status",
		"env git status",
		"time git status",
		"MODE=1 git status",
		"git status > output",
		"git status && git log",
		"git status $HOME",
		"git status *",
	]) {
		assert.equal(parseCommandListEntry(entry), undefined, entry);
	}
});

test("applies exact block, deny, and allow precedence without weakening hard denials", async () => {
	const cwd = await workspace();
	await writeFile(join(cwd, "notes.txt"), "safe\n");
	const commandPolicy = compileCommandPolicy({
		commandAllowlist: ["git status", "npm test", "cat .env"],
		commandDenylist: ["git log", "npm test"],
		commandBlocklist: ["git push"],
	});

	const allowed = await assessBashCommand("git status", cwd, commandPolicy);
	assert.equal(allowed.floor, "low");
	assert.equal(allowed.offAllowed, true);
	assert.equal(allowed.forceConfirmation, false);

	const allowCannotBeatDeny = await assessBashCommand("npm test", cwd, commandPolicy);
	assert.equal(allowCannotBeatDeny.floor, "medium");
	assert.equal(allowCannotBeatDeny.offAllowed, false);
	assert.equal(allowCannotBeatDeny.forceConfirmation, true);

	const denied = await assessBashCommand("git log", cwd, commandPolicy);
	assert.equal(denied.floor, "low");
	assert.equal(denied.offAllowed, false);
	assert.equal(denied.forceConfirmation, true);

	const blocked = await assessBashCommand("git push", cwd, commandPolicy);
	assert.equal(blocked.floor, "high");
	assert.equal(blocked.hardDeny, true);

	const compound = await assessBashCommand("git status && git log", cwd, commandPolicy);
	assert.equal(compound.floor, "low");
	assert.equal(compound.offAllowed, false);
	assert.equal(compound.forceConfirmation, true);

	const protectedPath = await assessBashCommand("cat .env", cwd, commandPolicy);
	assert.equal(protectedPath.floor, "high");
	assert.equal(protectedPath.hardDeny, true);

	const assigned = await assessBashCommand("MODE=1 git status", cwd, commandPolicy);
	assert.equal(assigned.floor, "high");
	assert.equal(assigned.offAllowed, false);
});

test("canonicalizes filesystem reader roots and fails closed on ambiguous operands", async () => {
	const cwd = await workspace();
	await writeFile(join(cwd, "notes.txt"), "safe\n");

	for (const command of ["cat notes.txt", "find . -type f", "ls", "du -sh .", "wc -l notes.txt"]) {
		const result = await assessBashCommand(command, cwd);
		assert.equal(result.floor, "low", command);
		assert.equal(result.hardDeny, false, command);
	}

	for (const command of ["cat ../outside", "find ../outside -type f", "ls ../outside", "du -sh ../outside", "wc -l ../outside"]) {
		const result = await assessBashCommand(command, cwd);
		assert.equal(result.floor, "high", command);
		assert.equal(result.hardDeny, true, command);
	}

	assert.equal((await assessBashCommand("cat", cwd)).floor, "high");
	assert.equal((await assessBashCommand("ls --dereference", cwd)).floor, "high");
});

test("canonicalizes explicit downloader output destinations", async () => {
	const cwd = await workspace();
	const safe = [
		"curl -o download.txt https://example.com/file",
		"curl --output=download.txt https://example.com/file",
		"wget -Odownload.txt https://example.com/file",
		"wget --output-document=download.txt https://example.com/file",
	];
	for (const command of safe) {
		const result = await assessBashCommand(command, cwd);
		assert.equal(result.floor, "medium", command);
		assert.equal(result.hardDeny, false, command);
	}

	for (const command of [
		"curl -o .env https://example.com/file",
		"curl --output=.env https://example.com/file",
		"wget -O ../outside.txt https://example.com/file",
		"wget --output-document=.env https://example.com/file",
	]) {
		const result = await assessBashCommand(command, cwd);
		assert.equal(result.floor, "high", command);
		assert.equal(result.hardDeny, true, command);
	}
	assert.equal((await assessBashCommand("curl -O https://example.com/file", cwd)).floor, "high");
	assert.equal((await assessBashCommand("wget https://example.com/file", cwd)).floor, "high");
});

test("elevates Docker host escapes, all tar extraction forms, and kubectl exec", async () => {
	const cwd = await workspace();
	for (const command of [
		"docker run -v /:/host image",
		"docker run -v ../private:/mnt image",
		"docker run -v safe/../../private:/mnt image",
		"docker run --mount type=bind,source=safe/../../private,target=/mnt image",
		"docker run -v /tmp:/mnt image",
		"docker run --mount type=bind,source=../private,target=/mnt image",
		"docker run --mount type=bind,src=/tmp,dst=/mnt image",
		"docker run --privileged image",
		"docker run --pid host image",
		"docker run --network=host image",
		"docker run --ipc host image",
		"docker run --uts=host image",
		"docker run --cgroupns host image",
		"docker run --cap-add SYS_ADMIN image",
		"docker run --unknown image",
		"tar -xvf archive.tar",
		"tar xvf archive.tar",
		"tar --extract -f archive.tar",
		"kubectl exec pod -- cat README.md",
		"kubectl -n default exec pod -- cat README.md",
	]) {
		assert.equal((await assessBashCommand(command, cwd)).floor, "high", command);
	}
	assert.equal((await assessBashCommand("docker run -v cache:/cache image", cwd)).floor, "medium");
	assert.equal((await assessBashCommand("docker run -v ./cache:/cache image", cwd)).floor, "medium");
	assert.equal((await assessBashCommand("docker run --mount type=bind,source=./cache,target=/cache image", cwd)).floor, "medium");
	assert.equal((await assessBashCommand("tar -tf archive.tar", cwd)).floor, "low");
});

test("marks only bare literal Git commit and push segments for Shield scanning", async () => {
	const cwd = await workspace();
	const commit = await assessBashCommand("git commit -m message", cwd);
	assert.deepEqual(commit.shieldPlans, [{ kind: "commit", args: ["commit", "-m", "message"] }]);

	const push = await assessBashCommand("git push", cwd);
	assert.deepEqual(push.shieldPlans, [{ kind: "push", args: ["push"] }]);

	const compound = await assessBashCommand("git commit -m message && git push", cwd);
	assert.deepEqual(compound.shieldPlans, [
		{ kind: "commit", args: ["commit", "-m", "message"] },
		{ kind: "push", args: ["push"] },
	]);

	for (const command of [
		"command git commit -m message",
		"MODE=1 git commit -m message",
		"./git commit -m message",
		"git commit -m '$MESSAGE'",
	]) {
		assert.deepEqual((await assessBashCommand(command, cwd)).shieldPlans, [], command);
	}
});

test("classifies control operators and literal nested shell payloads without running them", async () => {
	for (const command of [
		"git status && rm -rf temporary",
		"false || git reset --hard",
		"git status | rm -rf temporary",
		"sh -c 'rm -rf temporary'",
		"docker exec container rm -rf temporary",
		"ssh host 'rm -rf temporary'",
	]) {
		const result = await classify(command);
		assert.equal(result.floor, "high", command);
		assert.equal(result.hardDeny, true, command);
	}
	assert.equal((await classify("kubectl exec pod -- rm -rf temporary")).floor, "high");
});

test("rejects ambiguous shell syntax and protects redirect targets", async () => {
	const cwd = await workspace();
	assert.equal((await assessBashCommand("echo result > output.txt", cwd)).floor, "medium");

	for (const command of ["echo $(date)", "echo 'unterminated", "echo secret > .env", "echo data > /dev/null"]) {
		const result = await assessBashCommand(command, cwd);
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
	]) {
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
	]) {
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
