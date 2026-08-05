import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_ENTRIES = 1_000;
const MAX_BYTES = 1_048_576;

export interface FalsePositiveJournalEntry {
	kind: "false-positive";
	timestamp: string;
	sessionId: string;
	runtimeToolName: string;
	canonicalToolName: string;
	operationDigest: string;
	resourceDigest?: string;
	declaredRisk: "low" | "medium" | "high";
	declaredRiskReason: string;
	computedFloor: "low" | "medium" | "high";
	computedReason: string;
	effectiveRisk: "low" | "medium" | "high";
	mode: "auto" | "low" | "medium" | "high";
	policyRevision: string;
	intent: string;
	expectedEffect: string;
	rollbackPlan: string;
	userDisposition: "false-positive";
}

export class FalsePositiveJournal {
	private readonly directory: string;
	private readonly file: string;
	private writes = Promise.resolve();

	constructor(agentDirectory: string) {
		this.directory = join(agentDirectory, "security");
		this.file = join(this.directory, "false-positive-journal.json");
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
		if (entries.length > MAX_ENTRIES) throw new Error("False-positive journal exceeds its entry limit.");
		return entries;
	}
}
