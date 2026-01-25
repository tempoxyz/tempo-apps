/**
 * VerificationCoalescer prevents redundant on-chain verification calls
 * by deduplicating concurrent requests for the same transaction hash.
 */
export class VerificationCoalescer {
	private pending = new Map<string, Promise<boolean>>()

	/**
	 * Executes a verification function, coalescing multiple concurrent calls
	 * for the same hash into a single execution.
	 */
	public async verify(
		txHash: string,
		verifyFn: () => Promise<boolean>,
	): Promise<boolean> {
		// If verification already in progress, wait for existing promise
		const existing = this.pending.get(txHash)
		if (existing) {
			return existing
		}

		// Start new verification
		const promise = verifyFn().finally(() => {
			this.pending.delete(txHash)
		})

		this.pending.set(txHash, promise)
		return promise
	}

	/**
	 * Returns the number of currently pending verifications.
	 */
	public getPendingCount(): number {
		return this.pending.size
	}
}
