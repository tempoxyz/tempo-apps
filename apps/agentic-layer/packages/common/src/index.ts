/**
 * Tempo AlphaUSD stablecoin address on Moderato testnet
 */
export const ALPHA_USD_ADDRESS =
	'0x20c0000000000000000000000000000000000001' as const

/**
 * Tempo pathUSD native stablecoin address on Moderato testnet
 */
export const PATH_USD_ADDRESS =
	'0x20c0000000000000000000000000000000000000' as const

/**
 * Tempo Fee Manager contract address
 */
export const FEE_MANAGER_ADDRESS =
	'0xfeec000000000000000000000000000000000000' as const

/**
 * Default RPC URL for Tempo Moderato testnet
 */
export const TESTNET_RPC = 'https://rpc.moderato.tempo.xyz'

/**
 * Default Chain ID for Tempo Moderato testnet
 */
export const TESTNET_ID = 42431

/**
 * Standard HTTP header for communicating transaction hashes
 */
export const PAYMENT_TX_HEADER = 'x-tempo-tx-hash'

/**
 * Standard HTTP header for idempotency in payment requests
 */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key'

/**
 * Standard rate limiting headers
 */
export const RATE_LIMIT_HEADERS = {
	LIMIT: 'x-ratelimit-limit',
	REMAINING: 'x-ratelimit-remaining',
	RESET: 'x-ratelimit-reset',
} as const

/**
 * Standardized ERC20 interface for token interactions
 */
export const ERC20_ABI = [
	'function transfer(address to, uint256 amount) returns (bool)',
	'function balanceOf(address owner) view returns (uint256)',
	'function approve(address spender, uint256 amount) returns (bool)',
] as const
import { parseAbi } from 'viem'

/**
 * Pre-parsed Transfer event ABI for efficient decoding.
 */
export const TRANSFER_EVENT_ABI = parseAbi([
	'event Transfer(address indexed from, address indexed to, uint256 value)',
])

/**
 * Keccak-256 hash of the ERC20 Transfer event signature.
 */
export const TRANSFER_TOPIC =
	'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/**
 * Default timeout for network requests (30 seconds)
 */
export const DEFAULT_TIMEOUT_MS = 30000

/**
 * Default maximum age for transaction validity (5 minutes)
 */
export const DEFAULT_MAX_AGE_SECONDS = 300

/**
 * Detailed payment requirement information returned in 402 responses
 */
export interface PaymentInfo {
	/** Payment method identifier */
	method?: string
	/** Recipient address for the payment */
	recipient: string
	/** Amount required in atomic units */
	amount: string
	/** Token contract address */
	token: string
	/** Target chain ID */
	chainId: number
	/** RPC URL for verification */
	rpcUrl: string
	/** Optional authentication realm */
	realm?: string
	/** Optional description of the service being purchased */
	description?: string
}

/**
 * Error response body for 402 Payment Required status
 */
export interface PaymentError {
	/** Error message description */
	error: string
	/** Payment details required to fulfill the request */
	paymentInfo: PaymentInfo
	/** Optional suggestions for the agent to optimize the payment */
	agentHint?: {
		/** Recommended token to use for fees if different from primary */
		recommendedFeeToken: string
		/** Memo or reference for the transaction */
		memo: string
	}
}
// Protocol-standard HTTP 402 terminology
export const AUTH_HEADER_PREFIX = 'Tempo'

/**
 * Logger interface for flexible logging implementations
 */
export interface Logger {
	debug(message: string, meta?: unknown): void
	info(message: string, meta?: unknown): void
	warn(message: string, meta?: unknown): void
	error(message: string, meta?: unknown): void
}

/**
 * Console-based logger implementation
 */
export class ConsoleLogger implements Logger {
	private level: 'debug' | 'info' | 'warn' | 'error'
	private levels = ['debug', 'info', 'warn', 'error']

	constructor(level: 'debug' | 'info' | 'warn' | 'error' = 'info') {
		this.level = level
	}

	debug(message: string, meta?: unknown): void {
		if (this.shouldLog('debug')) {
			console.debug(message, meta !== undefined ? meta : '')
		}
	}

	info(message: string, meta?: unknown): void {
		if (this.shouldLog('info')) {
			console.log(message, meta !== undefined ? meta : '')
		}
	}

	warn(message: string, meta?: unknown): void {
		if (this.shouldLog('warn')) {
			console.warn(message, meta !== undefined ? meta : '')
		}
	}

	error(message: string, meta?: unknown): void {
		if (this.shouldLog('error')) {
			console.error(message, meta !== undefined ? meta : '')
		}
	}

	private shouldLog(level: string): boolean {
		return this.levels.indexOf(level) >= this.levels.indexOf(this.level)
	}
}

/**
 * Silent logger for testing
 */
export class SilentLogger implements Logger {
	debug(_message: string, _meta?: unknown): void { }
	info(_message: string, _meta?: unknown): void { }
	warn(_message: string, _meta?: unknown): void { }
	error(_message: string, _meta?: unknown): void { }
}

export * from './types'
export * from './validation'
export * from './config'
export * from './errors'
export * from './services/VerificationService'
export * from './services/ReplayProtection'
export * from './services/VerificationCoalescer'
