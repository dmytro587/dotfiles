import { appendFile, chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AuditEvent } from "./types.ts";

export function redactText(value: string, limit = 360) {
	return value
		.replace(/\$\([^)]*\)/g, "$(…redacted…)")
		.replace(/\b(token|password|secret|(?:api|client)?[_-]?key|cookie|authorization|credential)\s*([=:])\s*[^\s,;]+/gi, "$1$2[redacted]")
		.replace(/--(?:token|password|secret|(?:api|client)?[_-]?key|cookie|authorization|credential)(?:=|\s+)\S+/gi, "--credential [redacted]")
		.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
		.slice(0, limit);
}

/** Stores only redacted facts and digests; journal contents never enter this log. */
export class AuditRecorder {
	private readonly directory: string;
	private readonly file: string;

	constructor(agentDirectory: string) {
		this.directory = join(agentDirectory, "permission-audit");
		this.file = join(this.directory, "events.jsonl");
	}

	async append(event: AuditEvent): Promise<void> {
		await mkdir(this.directory, { recursive: true, mode: 0o700 });
		await chmod(this.directory, 0o700);
		try {
			await chmod(this.file, 0o600);
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		await appendFile(this.file, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
		await chmod(this.file, 0o600);
	}
}
