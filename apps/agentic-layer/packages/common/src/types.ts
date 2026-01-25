import type { Logger } from './index'

/**
 * Base configuration interface for payment verification.
 * Consolidated from Server and Common config types.
 */
export interface CommonGateConfig {
	/** Target recipient address for payments */
	recipient?: string
	/** Amount required in atomic units */
	amount?: string
	/** Token contract address */
	token?: string
	/** RPC URL for verification */
	rpcUrl?: string
	/** Optional maximum age for transaction validity in seconds */
	allowedAgeSeconds?: number
	/** Optional logger instance */
	logger?: Logger
}

/**
 * Interface for replay protection cache.
 * Allows swapping in-memory cache for Redis or other persistent stores.
 */
export interface IReplayCache {
	/** Attempt to mark hash as used. Returns true if successful (fresh). */
	markUsed(txHash: string): boolean | Promise<boolean>
	/** Start verification lock. Returns true if lock acquired. */
	beginVerification(txHash: string): boolean | Promise<boolean>
	/** Commit verification as successful. */
	commitVerification(txHash: string): void | Promise<void>
	/** Rollback verification lock. */
	rollbackVerification(txHash: string): void | Promise<void>
}
