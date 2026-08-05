import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assess } from "./policy.ts";
import type { PermissionPolicyConfig } from "./types.ts";

const policy: PermissionPolicyConfig = {
	version: 1,
	testedPiVersion: "0.83.0",
	defaultAutonomy: "auto",
	limits: {
		maxTextFileBytes: 128,
		maxOperationBytes: 128,
		maxPermitRequestBytes: 128,
		permitTtlMs: 1_000,
		maxMediumFilesPerSession: 2,
		maxMediumSnapshotBytesPerSession: 128,
	},
};

function context(cwd: string, mediumBudget = { fileCount: 0, snapshotBytes: 0 }) {
	return { cwd, sessionId: "test-session", policyRevision: "sha256:test-policy", policy, mediumBudget };
}

test("classifies workspace reads, reversible text mutations, and arbitrary Bash deterministically", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-policy-"));
	await writeFile(join(workspace, "notes.txt"), "before\n");
	await writeFile(join(workspace, "binary.bin"), Buffer.from([0, 1, 2]));

	const read = await assess("read", { path: "notes.txt" }, context(workspace));
	assert.equal(read.floor, "low");
	assert.equal(read.hardDeny, false);
	assert.match(read.resourceDigest!, /^sha256:/);

	const ffgrep = await assess("functions.ffgrep", { path: ".", pattern: "Redis exporter" }, context(workspace));
	assert.equal(ffgrep.floor, "low");
	assert.equal(ffgrep.toolName, "functions.ffgrep");
	const namespacedRead = await assess("functions.read", { path: "notes.txt" }, context(workspace));
	assert.equal(namespacedRead.floor, "low");
	const namespacedWrite = await assess("functions.write", { path: "functions-new.txt", content: "new text\n" }, context(workspace));
	assert.equal(namespacedWrite.floor, "medium");
	assert.equal(namespacedWrite.toolName, "functions.write");
	assert.equal((await assess("functions.bash", { command: "git status" }, context(workspace))).floor, "low");

	const edit = await assess(
		"edit",
		{ path: "notes.txt", edits: [{ oldText: "before", newText: "after" }] },
		context(workspace),
	);
	assert.equal(edit.floor, "medium");
	assert.equal(edit.reversible, true);
	assert.equal(edit.predictedSnapshotBytes, Buffer.byteLength("before\n"));

	const create = await assess("write", { path: "new.txt", content: "new text\n" }, context(workspace));
	assert.equal(create.floor, "medium");
	assert.equal(create.reversible, true);

	const binary = await assess("write", { path: "binary.bin", content: "replacement" }, context(workspace));
	assert.equal(binary.floor, "high");
	assert.equal(binary.reversible, false);

	assert.equal((await assess("bash", { command: "git status" }, context(workspace))).floor, "low");
	assert.equal((await assess("bash", { command: "npm test" }, context(workspace))).floor, "medium");
	assert.equal((await assess("bash", { command: "kubectl get pods -n default" }, context(workspace))).floor, "low");
	assert.equal((await assess("subagent", { task: "review" }, context(workspace))).floor, "high");
	assert.equal((await assess("network_tool", { url: "https://example.test" }, context(workspace))).floor, "high");
});
test("allows validated globbed search paths while denying protected or escaping roots", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-search-glob-"));
	await mkdir(join(workspace, ".agents", "skills", "example"), { recursive: true });
	await writeFile(join(workspace, ".agents", "skills", "example", "SKILL.md"), "name: example\n");
	await symlink(join(workspace, ".agents", "skills"), join(workspace, "linked-skills"));
	const safe = context(workspace);

	const fffind = await assess("functions.fffind", { path: ".agents/skills/**", pattern: "*", limit: 100 }, safe);
	assert.equal(fffind.floor, "low");
	assert.equal(fffind.hardDeny, false);

	const ffgrep = await assess("functions.ffgrep", { path: ".agents/skills/**/*.md", pattern: "name" }, safe);
	assert.equal(ffgrep.floor, "low");
	assert.equal(ffgrep.hardDeny, false);

	for (const path of [".ssh/**", "**/.env", "**/.env*", "../outside/**", "linked-skills/**"]) {
		const result = await assess("fffind", { path, pattern: "*" }, safe);
		assert.equal(result.floor, "high", path);
		assert.equal(result.hardDeny, true, path);
	}
});

test("classifies bounded ripgrep inspection and shell formatting as read-only", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-rg-"));
	const safe = context(workspace);
	const reported = "printf '%s\\n' '--- skills ---'; find .agents/skills -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | sort; printf '%s\\n' '--- references ---'; rg -n --glob '!node_modules/**' '(alerting-irm|computer-use|orchestration)' . || true; printf '%s\\n' '--- status ---'; git status --short";

	assert.equal((await assess("bash", { command: "sort -o sorted.txt" }, safe)).floor, "high");
	assert.equal((await assess("bash", { command: reported }, safe)).floor, "low");
	assert.equal((await assess("bash", { command: "rg -n --hidden 'reference' ." }, safe)).floor, "high");
	assert.equal((await assess("bash", { command: "rg --pre cat 'reference' ." }, safe)).floor, "high");
	const protectedGlob = await assess("bash", { command: "rg --glob '**/.env*' 'reference' ." }, safe);
	assert.equal(protectedGlob.floor, "high");
	assert.equal(protectedGlob.hardDeny, true);
	const outside = await assess("bash", { command: "rg 'reference' ../outside" }, safe);
	assert.equal(outside.floor, "high");
	assert.equal(outside.hardDeny, true);
});


test("applies declarative Bash risk floors without executing commands", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-bash-"));
	const safe = context(workspace);

	for (const command of [
		"git status",
		"kubectl get pods -A",
		"helm template api ./chart",
		"kops validate cluster",
		"docker ps",
		"aws sts get-caller-identity",
		"time command git status",
	]) {
		assert.equal((await assess("bash", { command }, safe)).floor, "low", command);
	}

	for (const command of [
		"npm test",
		"terraform plan",
		"curl --get https://example.com/api",
		"ssh host 'git status'",
		"kubectl exec pod -- cat README.md",
		"echo result > result.txt",
	]) {
		const result = await assess("bash", { command }, safe);
		assert.equal(result.floor, "medium", command);
		assert.equal(result.journalAdapter, "none", command);
	}

	for (const command of [
		"kubectl apply -f deployment.yaml",
		"terraform apply tfplan",
		"helm upgrade --install api ./chart",
		"kops delete cluster prod.example.com",
		"docker run -v /:/host image",
		"aws secretsmanager get-secret-value --secret-id prod",
		"kubectl get secret app",
		"curl --request=POST https://example.com/api",
		"cat .pi/agent/auth.json",
		"git push",
		"npm run custom-script",
		"unknown-command",
		"echo $(date)",
		"echo 'unterminated",
	]) {
		assert.equal((await assess("bash", { command }, safe)).floor, "high", command);
	}

	for (const command of [
		"rm -rf temporary",
		"git status | rm -rf temporary",
		"false || git reset --hard",
		"sh -c 'rm -rf temporary'",
		"kubectl exec pod -- rm -rf temporary",
		"docker exec container rm -rf temporary",
		"ssh host 'rm -rf temporary'",
		"echo secret > .env",
		"echo secret > ../outside.txt",
	]) {
		const result = await assess("bash", { command }, safe);
		assert.equal(result.floor, "high", command);
		assert.equal(result.hardDeny, true, command);
	}
});

test("covers every supported Bash command family with exact argument overrides", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-bash-families-"));
	const safe = context(workspace);
	const low = [
		"pwd",
		"find . -type f",
		"npm view pi",
		"pnpm list",
		"yarn why typescript",
		"pip list",
		"brew list",
		"tar -tf archive.tar",
		"kubectl auth can-i get pods",
		"kubectl config current-context",
		"helm lint ./chart",
		"helm version",
		"kops get clusters",
		"docker compose ps",
		"aws ec2 describe-instances",
		"gcloud compute instances list",
		"gcloud projects list",
		"az vm list",
		"az account show",
		"gh pr view 1",
		"gh pr diff 2955 --repo cli/cli --color=never",
		"gh pr diff 2955 --repo cli/cli --color=never | sed -n '1,240p'",
		"gh issue list",
		"git fetch",
	];
	const medium = [
		"npm ci",
		"npm run build",
		"pnpm install --frozen-lockfile",
		"pip install package",
		"cargo check",
		"go test ./...",
		"git commit -m message",
		"git pull --ff-only",
		"git switch -c branch",
		"git reset --soft HEAD~1",
		"helm repo add stable https://example.com/charts",
		"helm dependency update",
		"docker build .",
		"docker pull image",
		"docker run image",
		"docker run -v cache:/cache image",
		"docker stop container",
		"docker compose up",
		"kubectl port-forward pod/demo 8080:80",
		"tar -xf archive.tar",
		"tar --extract -f archive.tar",
		"aws s3 cp s3://bucket/data result.txt",
	];
	const high = [
		"git switch branch",
		"docker rm container",
		"curl --cookie session=token https://example.com/api",
		"curl -bsession=token https://example.com/api",
		"curl --oauth2-bearer token https://example.com/api",
		"curl --netrc https://example.com/api",
		"curl --cert certificate.txt https://example.com/api",
		"curl --key private-material.txt https://example.com/api",
		"sudo ls",
		"kubectl config view",
		"kubectl get pods --token=credential",
		"kubectl get secret/prod -o yaml",
		"curl -H 'Authorization: Bearer credential' https://example.com/api",
		"curl --user alice:password https://example.com/api",
		"curl -ualice:password https://example.com/api",
		"helm get values release",
		"terraform output -raw secret",
		"gh pr create --title change",
		"gh pr diff 2955 --web",
		"gh pr diff 2955 --web=true",
		"gh pr diff 2955 -w",
		"gh pr diff 2955 -w=true",
		"gh pr diff 2955 -wR cli/cli",
		"sed -i '' 's/before/after/' notes.txt",
		"npm publish",
		"docker push image",
		"docker login",
		"kubectl delete pod demo",
		"helm rollback release 1",
		"terraform destroy",
		"aws s3 cp local.txt s3://bucket/data",
		"scp local.txt host:remote.txt",
		"psql -c 'UPDATE account SET role = admin'",
		"gcloud compute instances delete list --quiet",
		"az group delete --name list --yes",
		"gcloud compute instances stop list --quiet",
		"az vm stop --name list",
		"gcloud compute instances reset list --quiet",
		"gcloud compute instances suspend list --quiet",
		"az vm deallocate --name list",
		"find . -exec cat {} \\;",
	];
	const hardDenied = [
		"git clean -fd",
		"/bin/rm -rf temporary",
		"find . -execdir rm -rf temporary \\;",
		"find . -exec sh -c 'rm -rf temporary' {} \\;",
		"ssh host sh -c 'rm -rf temporary'",
		"ssh host env sh -c 'rm -rf temporary'",
		"ssh host command sh -c 'rm -rf temporary'",
		"ssh host time sh -c 'rm -rf temporary'",
		"rm --force file",
		"rm --recursive directory",
		"find . -delete",
		"dd of=/dev/disk1",
		"mkfs.ext4 /dev/disk1",
		"git restore file",
		"git switch --discard-changes main",
		"git switch -f main",
		"docker compose down --volumes",
		"aws s3 cp s3://bucket/data ../outside.txt",
		"psql -c 'DROP TABLE account'",
		"ssh -o 'ProxyCommand=rm -rf temporary' host 'git status'",
		"ssh -F ssh-config host 'git status'",
		"ssh -Fssh-config host 'git status'",
		"cat deploy.pem",
	];

	for (const command of low) assert.equal((await assess("bash", { command }, safe)).floor, "low", command);
	for (const command of medium) assert.equal((await assess("bash", { command }, safe)).floor, "medium", command);
	for (const command of high) assert.equal((await assess("bash", { command }, safe)).floor, "high", command);
	for (const command of hardDenied) {
		const result = await assess("bash", { command }, safe);
		assert.equal(result.floor, "high", command);
		assert.equal(result.hardDeny, true, command);
	}
	const unprovenFind = await assess("bash", { command: "find . -exec cat {} \\;" }, safe);
	assert.equal(unprovenFind.hardDeny, false);
});

test("hard-denies protected, escaped, globbed, and symlinked path references", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-paths-"));
	await writeFile(join(workspace, ".env"), "TOKEN=secret\n");
	await writeFile(join(workspace, "safe.txt"), "safe\n");
	await symlink(join(workspace, "safe.txt"), join(workspace, "link.txt"));
	await mkdir(join(workspace, "nested"));

	for (const path of [".env", ".npmrc", "../outside.txt", "*.txt", "link.txt"]) {
		const result = await assess("read", { path }, context(workspace));
		assert.equal(result.floor, "high", path);
		assert.equal(result.hardDeny, true, path);
	}

	const bashSecret = await assess("bash", { command: "cat .env" }, context(workspace));
	assert.equal(bashSecret.hardDeny, true);
	const absoluteBashSecret = await assess("bash", { command: `cat ${join(workspace, ".env")}` }, context(workspace));
	assert.equal(absoluteBashSecret.hardDeny, true);
	const oversizedProtectedWrite = await assess("write", { path: ".env", content: "x".repeat(1_000) }, context(workspace));
	assert.equal(oversizedProtectedWrite.hardDeny, true);
});

test("escalates mutations after the per-session reversible budget is exhausted", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-budget-"));
	await writeFile(join(workspace, "notes.txt"), "before\n");

	const exhausted = await assess(
		"edit",
		{ path: "notes.txt", edits: [{ oldText: "before", newText: "after" }] },
		context(workspace, { fileCount: 2, snapshotBytes: 0 }),
	);
	assert.equal(exhausted.floor, "high");
	assert.match(exhausted.reason, /budget/i);
});

test("binds an operation digest to the session, policy revision, and exact normalized arguments", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-digest-"));
	await writeFile(join(workspace, "notes.txt"), "before\n");
	const input = { path: "notes.txt", edits: [{ oldText: "before", newText: "after" }] };

	const first = await assess("edit", input, context(workspace));
	const second = await assess("edit", { ...input, edits: [{ oldText: "before", newText: "different" }] }, context(workspace));
	const changedRevision = await assess("edit", input, { ...context(workspace), policyRevision: "sha256:next" });

	assert.notEqual(first.operationDigest, second.operationDigest);
	assert.notEqual(first.operationDigest, changedRevision.operationDigest);
});

test("canonicalizes model-visible tool names for permit matching", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-canonical-"));
	await writeFile(join(workspace, "notes.txt"), "before\n");
	const input = { path: "notes.txt", edits: [{ oldText: "before", newText: "after" }] };

	const requested = await assess("functions.edit", input, context(workspace));
	const invoked = await assess("edit", input, context(workspace));

	assert.equal(requested.canonicalToolName, "edit");
	assert.equal(invoked.canonicalToolName, "edit");
	assert.equal(requested.operationDigest, invoked.operationDigest);
});

test("profiles observed Pi tool identities without weakening unknown tools", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "pi-permission-tools-"));
	await writeFile(join(workspace, "notes.txt"), "before\n");
	const safe = context(workspace);

	for (const toolName of ["ffgrep", "functions.ffgrep", "fffind", "functions.fffind", "todo", "functions.todo", "wait", "web_search", "get_search_content"]) {
		const input = toolName.includes("grep") ? { path: ".", pattern: "before" } : {};
		assert.equal((await assess(toolName, input, safe)).floor, "low", toolName);
	}

	const fetch = await assess("fetch_content", { url: "https://example.com/page" }, safe);
	assert.equal(fetch.floor, "medium");
	assert.equal(fetch.journalAdapter, "none");
	for (const url of [
		"http://127.0.0.1:3000",
		"http://169.254.169.254/latest/meta-data",
		"http://192.168.1.1",
		"http://[::1]/",
		"https://token@example.com/data",
	]) {
		const result = await assess("fetch_content", { url }, safe);
		assert.equal(result.floor, "high", url);
		assert.equal(result.hardDeny, true, url);
	}

	const credentialHeader = await assess("fetch_content", { url: "https://example.com/", headers: { Authorization: "Bearer token" } }, safe);
	assert.equal(credentialHeader.floor, "high");
	assert.equal(credentialHeader.hardDeny, true);

	const prefixedCredentialHeader = await assess("fetch_content", { url: "https://example.com/", headers: { "X-Api-Key": "credential" } }, safe);
	assert.equal(prefixedCredentialHeader.floor, "high");
	assert.equal(prefixedCredentialHeader.hardDeny, true);

	const authTokenHeader = await assess("fetch_content", { url: "https://example.com/", headers: { "X-Auth-Token": "credential" } }, safe);
	assert.equal(authTokenHeader.floor, "high");
	assert.equal(authTokenHeader.hardDeny, true);

	assert.equal((await assess("subagent", { action: "status" }, safe)).floor, "low");
	assert.equal((await assess("subagent", { action: "spawn", role: "researcher", task: "Inspect the repository." }, safe)).floor, "high");
	assert.equal((await assess("unknown_tool", {}, safe)).floor, "high");
});
