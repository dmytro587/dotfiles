import type { Permit } from "./types.ts";

/** In-memory, single-use permits. Session replacement deliberately drops them. */
export class PermitStore {
	private readonly permits = new Map<string, Permit>();
	private readonly resourcePermits = new Map<string, string>();

	issue(permit: Permit): { ok: true } | { ok: false; reason: string } {
		this.removeExpired();
		if (this.permits.has(permit.operationDigest)) {
			return { ok: false, reason: "An identical permission request is already pending." };
		}
		if (permit.resourceDigest && this.resourcePermits.has(permit.resourceDigest)) {
			return { ok: false, reason: "A permission request for this resource is already pending." };
		}
		this.permits.set(permit.operationDigest, permit);
		if (permit.resourceDigest) this.resourcePermits.set(permit.resourceDigest, permit.operationDigest);
		return { ok: true };
	}

	peek(operationDigest: string): Permit | undefined {
		this.removeExpired();
		return this.permits.get(operationDigest);
	}

	consume(operationDigest: string): Permit | undefined {
		const permit = this.peek(operationDigest);
		if (!permit) return undefined;
		this.permits.delete(operationDigest);
		if (permit.resourceDigest) this.resourcePermits.delete(permit.resourceDigest);
		return permit;
	}

	private removeExpired(): void {
		const now = Date.now();
		for (const [digest, permit] of this.permits) {
			if (permit.expiresAt > now) continue;
			this.permits.delete(digest);
			if (permit.resourceDigest) this.resourcePermits.delete(permit.resourceDigest);
		}
	}
}
