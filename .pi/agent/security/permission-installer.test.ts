import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const installer = join(repository, "install_pi_permission_gate.sh");

function runInstaller(home: string, agentDirectory: string): Promise<{ code: number | null; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn("bash", [installer], {
			cwd: repository,
			env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: agentDirectory },
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		child.stderr.on("data", (chunk) => { stderr += String(chunk); });
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stderr }));
	});
}

test("installer copies private gate files and appends the configured extension path exactly once", async () => {
	const home = await mkdtemp(join(tmpdir(), "pi-permission-installer-"));
	const agentDirectory = join(home, "agent");
	const extension = join(agentDirectory, "security", "permission-gate.ts");
	await mkdir(agentDirectory, { recursive: true });
	await mkdir(join(agentDirectory, "security"), { recursive: true });
	await writeFile(join(agentDirectory, "security", "permits.ts"), "obsolete\n");
	await writeFile(join(agentDirectory, "security", "risk-judge.ts"), "obsolete\n");
	await writeFile(join(agentDirectory, "settings.json"), JSON.stringify({
		theme: "dark",
		packages: ["npm:existing-package"],
		extensions: ["/existing/extension.ts", extension],
	}));
	const first = await runInstaller(home, agentDirectory);
	assert.equal(first.code, 0, first.stderr);
	const second = await runInstaller(home, agentDirectory);
	assert.equal(second.code, 0, second.stderr);

	const settings = JSON.parse(await readFile(join(agentDirectory, "settings.json"), "utf8")) as { extensions: string[]; theme: string; packages: string[] };
	assert.deepEqual(settings.extensions, ["/existing/extension.ts", extension]);
	assert.equal(settings.theme, "dark");
	assert.deepEqual(settings.packages, ["npm:existing-package"]);
	const installedPolicy = await readFile(join(agentDirectory, "permission-policy.json"), "utf8");
	assert.equal(JSON.parse(installedPolicy).defaultAutonomy, "off");
	assert.equal(installedPolicy.includes("maxPermitRequestBytes"), false);
	assert.equal(installedPolicy.includes("permitTtlMs"), false);
	assert.equal((await stat(join(agentDirectory, "security"))).mode & 0o777, 0o700);
	assert.equal((await stat(extension)).mode & 0o777, 0o600);
	assert.equal((await stat(join(agentDirectory, "security", "shield.ts"))).mode & 0o777, 0o600);
	await assert.rejects(stat(join(agentDirectory, "security", "permits.ts")), { code: "ENOENT" });
	await assert.rejects(stat(join(agentDirectory, "security", "risk-judge.ts")), { code: "ENOENT" });
	await assert.rejects(stat(join(agentDirectory, "security", "permission-installer.test.ts")), { code: "ENOENT" });
});
