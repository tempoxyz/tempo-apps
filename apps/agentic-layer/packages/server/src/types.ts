import type { Request } from 'express'
import type { Logger } from '@tempo/402-common'
import type { IReplayCache, VerificationCoalescer } from './store'

/**
 * Extended Express Request with payment context
 */
export interface PaymentRequest extends Request {
	payment?: {
		txHash: `0x${string}`
	}
}

/**
 * Shared configuration for the 402 authorization gate.
 */
export interface BaseGateConfig {
	/** Recipient address for the payment */
	recipient?: string
	/** Amount required in atomic units */
	amount?: string
	/** Token contract address */
	token?: string
	/** RPC URL for verification */
	rpcUrl?: string
	/** Optional logger instance */
	logger?: Logger
	/** Optional maximum age for transaction validity */
	allowedAgeSeconds?: number
	/** Optional replay cache instance */
	replayCache?: IReplayCache
	/** Optional verification coalescer instance */
	coalescer?: VerificationCoalescer
}
