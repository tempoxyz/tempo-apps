import { LRUCache } from 'lru-cache'
import type { IReplayCache } from '../types'

/**
 * ReplayProtection tracks transaction hashes to prevent reuse.
 * Uses an LRU cache with TTL to ensure bounded memory usage.
 * Implements a multi-phase verification pattern to prevent race conditions.
 */
export class ReplayProtection implements IReplayCache {
	private cache: LRUCache<string, 'pending' | 'verified'>

	constructor(maxAgeMs: number = 300000) {
		// 5 minutes default
		this.cache = new LRUCache({
			max: 10000,
			ttl: maxAgeMs,
			updateAgeOnGet: false,
		})
	}

	/**
	 * Attempts to mark a hash as used. Returns true if successful (fresh).
	 * Uses a 'pending' state to block concurrent verification attempts.
	 */
	public markUsed(txHash: string): boolean {
		if (this.cache.has(txHash)) {
			return false
		}
		this.cache.set(txHash, 'verified')
		return true
	}

	/**
	 * Initiates a verification attempt. Returns true if no verification is in progress.
	 */
	public beginVerification(txHash: string): boolean {
		if (this.cache.has(txHash)) {
			return false
		}
		this.cache.set(txHash, 'pending')
		return true
	}

	/**
	 * Commits a successful verification.
	 */
	public commitVerification(txHash: string): void {
		this.cache.set(txHash, 'verified')
	}

	/**
	 * Rolls back a failed verification attempt.
	 */
	public rollbackVerification(txHash: string): void {
		if (this.cache.get(txHash) === 'pending') {
			this.cache.delete(txHash)
		}
	}

	public clear(): void {
		this.cache.clear()
	}

	public size(): number {
		return this.cache.size
	}
}
