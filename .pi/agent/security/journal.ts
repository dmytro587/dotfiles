import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isTextBuffer, sha256 } from "./canonical.ts";
import type { CanonicalPath, MediumBudget } from "./types.ts";

export type JournalStatus = "pending" | "applied" | "not-applied" | "recovery-unknown" | "undone";

export interface JournalEntry {
	id: string;
	sessionId: string;
	operationDigest: string;
	toolName: "edit" | "write";
	targetPath: string;
	targetLabel: string;
	existed: boolean;
	preChecksum?: string;
	postChecksum?: string;
	preMode?: number;
	snapshotBytes: number;
	createdAt: string;
	status: JournalStatus;
}

async function exists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

async function ensurePrivateDirectory(path: string): Promise<void> {
	await mkdir(path, { recursive: true, mode: 0o700 });
	await chmod(path, 0o700);
}

/**
 * Private, session-local pre-image store. It intentionally contains full file
 * contents, so it never receives protected or out-of-workspace paths.
 */
export class ReversibilityJournal {
	readonly sessionDirectory: string;
	readonly sessionId: string;

	constructor(agentDirectory: string, sessionId: string) {
		this.sessionId = sessionId;
		this.sessionDirectory = join(agentDirectory, "permission-journal", sessionId.replace(/[^a-zA-Z0-9_-]/g, "_"));
	}

	private metadataPath(id: string): string {
		return join(this.sessionDirectory, `${id}.json`);
	}

	private preImagePath(id: string): string {
		return join(this.sessionDirectory, `${id}.preimage`);
	}

	private async writeMetadata(entry: JournalEntry): Promise<void> {
		await ensurePrivateDirectory(this.sessionDirectory);
		const finalPath = this.metadataPath(entry.id);
		const temporaryPath = `${finalPath}.${process.pid}.${randomUUID()}.tmp`;
		await writeFile(temporaryPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
		await chmod(temporaryPath, 0o600);
		await rename(temporaryPath, finalPath);
		await chmod(finalPath, 0o600);
	}

	private async loadEntry(id: string): Promise<JournalEntry> {
		return JSON.parse(await readFile(this.metadataPath(id), "utf8")) as JournalEntry;
	}

	async begin(operation: {
		operationDigest: string;
		toolName: "edit" | "write";
		resource: CanonicalPath;
	}): Promise<JournalEntry> {
		await ensurePrivateDirectory(this.sessionDirectory);
		const id = randomUUID();
		let preImage: Buffer | undefined;
		let preMode: number | undefined;
		if (!operation.resource.exists) {
			const parent = await lstat(dirname(operation.resource.absolutePath));
			if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error("Target parent changed before its journal snapshot could be created.");
		}
		if (operation.resource.exists) {
			const current = await lstat(operation.resource.absolutePath);
			if (!current.isFile() || current.isSymbolicLink()) throw new Error("Target changed before its journal snapshot could be created.");
			preImage = await readFile(operation.resource.absolutePath);
			if (!isTextBuffer(preImage)) throw new Error("Target changed to a binary file before snapshot.");
			preMode = current.mode & 0o777;
			await writeFile(this.preImagePath(id), preImage, { mode: 0o600 });
			await chmod(this.preImagePath(id), 0o600);
		}

		const entry: JournalEntry = {
			id,
			sessionId: this.sessionId,
			operationDigest: operation.operationDigest,
			toolName: operation.toolName,
			targetPath: operation.resource.absolutePath,
			targetLabel: operation.resource.relativePath,
			existed: operation.resource.exists,
			preChecksum: preImage ? sha256(preImage) : undefined,
			preMode,
			snapshotBytes: preImage?.byteLength ?? 0,
			createdAt: new Date().toISOString(),
			status: "pending",
		};
		await this.writeMetadata(entry);
		return entry;
	}

	async finalize(id: string, succeeded: boolean): Promise<JournalEntry> {
		const entry = await this.loadEntry(id);
		if (entry.status !== "pending") return entry;
		if (!succeeded) {
			entry.status = "not-applied";
			await rm(this.preImagePath(id), { force: true });
			await this.writeMetadata(entry);
			return entry;
		}

		try {
			const current = await lstat(entry.targetPath);
			if (!current.isFile() || current.isSymbolicLink()) throw new Error("Target is no longer a regular file.");
			const postImage = await readFile(entry.targetPath);
			entry.postChecksum = sha256(postImage);
			entry.status = "applied";
		} catch {
			// The tool may have applied before a crash or an intervening change. Do
			// not infer a post-image and never make this entry eligible for undo.
			entry.status = "recovery-unknown";
		}
		await this.writeMetadata(entry);
		return entry;
	}

	async usage(): Promise<MediumBudget> {
		const entries = await this.entries();
		return entries.reduce(
			(total, entry) => ({
				fileCount: total.fileCount + 1,
				snapshotBytes: total.snapshotBytes + entry.snapshotBytes,
			}),
			{ fileCount: 0, snapshotBytes: 0 },
		);
	}

	async entries(): Promise<JournalEntry[]> {
		if (!(await exists(this.sessionDirectory))) return [];
		const names = await readdir(this.sessionDirectory);
		const entries: JournalEntry[] = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			try {
				const entry = JSON.parse(await readFile(join(this.sessionDirectory, name), "utf8")) as JournalEntry;
				if (entry.sessionId === this.sessionId) entries.push(entry);
			} catch {
				// A partially-written record is not trusted and is never undoable.
			}
		}
		return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
	}

	async recover(): Promise<{ notApplied: number; unknown: number }> {
		let notApplied = 0;
		let unknown = 0;
		for (const entry of await this.entries()) {
			if (entry.status !== "pending") continue;
			try {
				const targetExists = await exists(entry.targetPath);
				if (!targetExists && !entry.existed) {
					entry.status = "not-applied";
					notApplied++;
				} else if (targetExists && entry.existed) {
					const currentStats = await lstat(entry.targetPath);
					if (!currentStats.isFile() || currentStats.isSymbolicLink()) throw new Error("Target is no longer a regular file.");
					const current = await readFile(entry.targetPath);
					if (sha256(current) === entry.preChecksum) {
						entry.status = "not-applied";
						notApplied++;
					} else {
						entry.status = "recovery-unknown";
						unknown++;
					}
				} else {
					entry.status = "recovery-unknown";
					unknown++;
				}
			} catch {
				entry.status = "recovery-unknown";
				unknown++;
			}
			await this.writeMetadata(entry);
		}
		return { notApplied, unknown };
	}

	async latestEligible(): Promise<JournalEntry | undefined> {
		const eligible = (await this.entries()).filter((entry) => entry.status === "applied");
		return eligible.at(-1);
	}

	async undo(entry: JournalEntry): Promise<void> {
		if (entry.status !== "applied" || !entry.postChecksum) throw new Error("Journal entry is not eligible for undo.");
		const currentStats = await lstat(entry.targetPath);
		if (!currentStats.isFile() || currentStats.isSymbolicLink()) throw new Error("Undo refused because the target is no longer a regular file.");
		const current = await readFile(entry.targetPath);
		if (sha256(current) !== entry.postChecksum) {
			throw new Error("Undo refused because another action changed the target after the journaled operation.");
		}

		if (entry.existed) {
			const preImage = await readFile(this.preImagePath(entry.id));
			await writeFile(entry.targetPath, preImage, { mode: entry.preMode ?? 0o600 });
			if (entry.preMode !== undefined) await chmod(entry.targetPath, entry.preMode);
		} else {
			await rm(entry.targetPath);
		}
		entry.status = "undone";
		await this.writeMetadata(entry);
	}

	label(entry: JournalEntry): string {
		return basename(entry.targetLabel) || entry.targetLabel;
	}
}
