import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isAutonomyMode, type AutonomyMode } from "./types.ts";

const MAX_ENTRIES = 1_000;
const MAX_BYTES = 1_048_576;
const JOURNAL_ENTRY_KEYS = ["schemaVersion", "kind", "timestamp", "sessionId", "operationDigest", "resourceDigest", "computedFloor", "computedReason", "mode", "policyRevision", "userDisposition"];

export interface FalsePositiveJournalEntry {
	schemaVersion: 1;
	kind: "deterministic-high-allow-once";
	timestamp: string;
	sessionId: string;
	operationDigest: string;
	resourceDigest?: string;
	computedFloor: "high";
	computedReason: string;
	mode: AutonomyMode;
	policyRevision: string;
	userDisposition: "allow-once";
}

function hasJournalEntryShape(entry: unknown) {
	if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false;
	if (!Object.keys(entry).every((key) => JOURNAL_ENTRY_KEYS.includes(key))) return false;
	if (!("schemaVersion" in entry) || !("kind" in entry) || !("timestamp" in entry) || !("sessionId" in entry) || !("operationDigest" in entry) || !("computedFloor" in entry) || !("computedReason" in entry) || !("mode" in entry) || !("policyRevision" in entry) || !("userDisposition" in entry)) return false;
	const resourceDigest = "resourceDigest" in entry ? entry.resourceDigest : undefined;
	return entry.schemaVersion === 1 &&
		entry.kind === "deterministic-high-allow-once" &&
		typeof entry.timestamp === "string" &&
		typeof entry.sessionId === "string" &&
		typeof entry.operationDigest === "string" &&
		(resourceDigest === undefined || typeof resourceDigest === "string") &&
		entry.computedFloor === "high" &&
		typeof entry.computedReason === "string" &&
		isAutonomyMode(entry.mode) &&
		typeof entry.policyRevision === "string" &&
		entry.userDisposition === "allow-once";
}

export class FalsePositiveJournal {
	private readonly directory: string;
	private readonly file: string;
	private writes = Promise.resolve();

	constructor(agentDirectory: string) {
		this.directory = join(agentDirectory, "security");
		this.file = join(this.directory, "false-positive-journal-v1.json");
	}

	record(entry: FalsePositiveJournalEntry) {
		const write = this.writes.then(() => this.append(entry));
		this.writes = write.then(() => undefined, () => undefined);
		return write;
	}

	private async append(entry: FalsePositiveJournalEntry) {
		await mkdir(this.directory, { recursive: true, mode: 0o700 });
		await chmod(this.directory, 0o700);
		const entries = await this.readEntries();
		if (entries.length >= MAX_ENTRIES) throw new Error("False-positive journal entry limit reached.");
		const content = `${JSON.stringify([...entries, entry], null, 2)}\n`;
		if (Buffer.byteLength(content, "utf8") > MAX_BYTES) throw new Error("False-positive journal size limit reached.");
		const temporary = join(this.directory, `.false-positive-journal-${randomUUID()}.tmp`);
		try {
			await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
			await chmod(temporary, 0o600);
			await rename(temporary, this.file);
			await chmod(this.file, 0o600);
		} catch (error) {
			await rm(temporary, { force: true }).catch(() => undefined);
			throw error;
		}
	}

	private async readEntries() {
		let content: string;
		try {
			content = await readFile(this.file, "utf8");
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
		if (Buffer.byteLength(content, "utf8") > MAX_BYTES) throw new Error("False-positive journal exceeds its size limit.");
		const entries: unknown = JSON.parse(content);
		if (!Array.isArray(entries)) throw new Error("False-positive journal must contain a JSON array.");
		if (!entries.every((entry) => hasJournalEntryShape(entry))) throw new Error("False-positive journal contains an unsupported entry shape.");
		if (entries.length > MAX_ENTRIES) throw new Error("False-positive journal exceeds its entry limit.");
		return entries;
	}
}
