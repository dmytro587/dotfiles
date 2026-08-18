import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const repository = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const extension = join(repository, "agent", "security", "permission-gate.ts");

function runPi(agentDirectory: string, args: string[] = []): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn("pi", ["--mode", "rpc", ...args], {
			env: {
				...process.env,
				PI_CODING_AGENT_DIR: agentDirectory,
				PI_SKIP_VERSION_CHECK: "1",
				PI_TELEMETRY: "0",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += String(chunk); });
		child.stderr.on("data", (chunk) => { stderr += String(chunk); });
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

test("loads the explicitly configured permission extension on the pinned Pi runtime", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-permission-extension-"));
	const agentDirectory = join(root, "agent");
	await mkdir(agentDirectory, { recursive: true });
	await writeFile(
		join(agentDirectory, "permission-policy.json"),
		JSON.stringify({
			version: 2,
			testedPiVersion: "0.83.0",
			defaultAutonomy: "off",
			commandAllowlist: [],
			commandDenylist: [],
			commandBlocklist: [],
			limits: {
				maxTextFileBytes: 262144,
				maxOperationBytes: 65536,
				maxMediumFilesPerSession: 25,
				maxMediumSnapshotBytesPerSession: 2097152,
				maxGitDiffBytes: 1048576,
			},
		}),
	);
	await writeFile(join(agentDirectory, "settings.json"), JSON.stringify({ extensions: [extension] }));

	const result = await runPi(agentDirectory);
	assert.equal(result.code, 0, result.stderr);
	assert.equal(result.stderr, "");
	assert.match(result.stdout, /"statusKey":"permission-gate"/);
	assert.match(result.stdout, /"statusText":"permission: off"/);

	const high = await runPi(agentDirectory, ["--permission-autonomy", "high"]);
	assert.equal(high.code, 0, high.stderr);
	assert.match(high.stdout, /"statusText":"permission: high"/);
});

