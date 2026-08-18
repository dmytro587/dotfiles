import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { canonicalizePath } from "./canonical.ts";
import { ReversibilityJournal } from "./journal.ts";
import { FalsePositiveJournal, type FalsePositiveJournalEntry } from "./false-positive-journal.ts";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "pi-permission-journal-"));
	const workspace = join(root, "workspace");
	const agentDirectory = join(root, "agent");
	await mkdir(workspace);
	await writeFile(join(workspace, "notes.txt"), "before\n");
	return { workspace, agentDirectory };
}

test("restores a checksum-safe existing text file and rejects drift", async () => {
	const { workspace, agentDirectory } = await fixture();
	const journal = new ReversibilityJournal(agentDirectory, "session-1");
	const resource = await canonicalizePath("notes.txt", workspace);
	const entry = await journal.begin({ operationDigest: "sha256:one", toolName: "edit", resource });

	await writeFile(join(workspace, "notes.txt"), "after\n");
	await journal.finalize(entry.id, true);
	await journal.undo((await journal.latestEligible())!);
	assert.equal(await readFile(join(workspace, "notes.txt"), "utf8"), "before\n");

	const second = await journal.begin({ operationDigest: "sha256:two", toolName: "edit", resource: await canonicalizePath("notes.txt", workspace) });
	await writeFile(join(workspace, "notes.txt"), "after again\n");
	await journal.finalize(second.id, true);
	await writeFile(join(workspace, "notes.txt"), "external change\n");
	const drifted = (await journal.latestEligible())!;
	await assert.rejects(() => journal.undo(drifted), /another action changed/i);
});

test("removes a journaled new file and records failed operations as non-applied", async () => {
	const { workspace, agentDirectory } = await fixture();
	const journal = new ReversibilityJournal(agentDirectory, "session-2");
	const entry = await journal.begin({
		operationDigest: "sha256:new",
		toolName: "write",
		resource: await canonicalizePath("new.txt", workspace),
	});
	await writeFile(join(workspace, "new.txt"), "created\n");
	await journal.finalize(entry.id, true);
	await journal.undo((await journal.latestEligible())!);
	await assert.rejects(() => readFile(join(workspace, "new.txt")), /ENOENT/);

	const failed = await journal.begin({
		operationDigest: "sha256:failed",
		toolName: "edit",
		resource: await canonicalizePath("notes.txt", workspace),
	});
	const finalized = await journal.finalize(failed.id, false);
	assert.equal(finalized.status, "not-applied");
	assert.equal(await journal.latestEligible(), undefined);
});

test("fails safe after a crash leaves a pending mutation with an unknown post-image", async () => {
	const { workspace, agentDirectory } = await fixture();
	const journal = new ReversibilityJournal(agentDirectory, "session-3");
	const entry = await journal.begin({
		operationDigest: "sha256:pending",
		toolName: "edit",
		resource: await canonicalizePath("notes.txt", workspace),
	});
	await writeFile(join(workspace, "notes.txt"), "possibly applied\n");

	const restarted = new ReversibilityJournal(agentDirectory, "session-3");
	const recovery = await restarted.recover();
	assert.equal(recovery.unknown, 1);
	const recovered = (await restarted.entries()).find((candidate) => candidate.id === entry.id)!;
	assert.equal(recovered.status, "recovery-unknown");
	assert.equal(await restarted.latestEligible(), undefined);
});

test("persists only narrow deterministic High Allow once audit facts and fails closed on invalid storage", async () => {
	const { agentDirectory } = await fixture();
	const journal = new FalsePositiveJournal(agentDirectory);
	const entry = {
		schemaVersion: 1,
		kind: "deterministic-high-allow-once",
		timestamp: "2026-08-10T00:00:00.000Z",
		sessionId: "session-4",
		operationDigest: "sha256:operation",
		computedFloor: "high",
		computedReason: "Unknown custom operation is High risk.",
		mode: "off",
		policyRevision: "sha256:policy",
		userDisposition: "allow-once",
	} satisfies FalsePositiveJournalEntry;
	const legacyFile = join(agentDirectory, "security", "false-positive-journal.json");
	await mkdir(join(agentDirectory, "security"), { recursive: true });
	await writeFile(legacyFile, '[{"kind":"historical"}]\n');
	await journal.record(entry);
	const file = join(agentDirectory, "security", "false-positive-journal-v1.json");
	assert.deepEqual(JSON.parse(await readFile(file, "utf8")), [entry]);
	assert.equal(await readFile(legacyFile, "utf8"), '[{"kind":"historical"}]\n');
	await writeFile(file, '[{"schemaVersion":1}]\n');
	await assert.rejects(journal.record(entry), /unsupported entry shape/i);


	await writeFile(file, "x".repeat(1_048_577));
	await assert.rejects(journal.record(entry), /size limit/i);

	await rm(file);
	await mkdir(file, { recursive: true });
	await assert.rejects(journal.record(entry));
});
