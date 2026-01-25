import {
	ALPHA_USD_ADDRESS,
	verifyPaymentHash,
	isValidTxHash,
	ReplayProtection,
	VerificationCoalescer,
	validateGateConfig,
	type Logger,
} from '@tempo/402-common'

/**
 * Shared configuration for all 402 authorization gates.
 */
export interface GateConfig {
	/** Recipient address for the payment */
	recipient: string
	/** Amount required in atomic units */
	amount: string
	/** Token contract address (defaults to ALPHA_USD_ADDRESS) */
	token?: string
	/** RPC URL for verification */
	rpcUrl: string
	/** Optional maximum age for transaction validity */
	allowedAgeSeconds?: number
	/** Optional replay cache instance */
	replayCache?: ReplayProtection
	/** Optional verification coalescer instance */
	coalescer?: VerificationCoalescer
	/** Optional logger instance */
	logger?: Logger
}

/**
 * Standardized result of a 402 verification check.
 */
export interface VerificationResult {
	/** HTTP status code to return */
	status: number
	/** Response body */
	body: any
	/** Optional headers to set */
	headers?: Record<string, string>
	/** Whether the request is authorized to proceed */
	authorized: boolean
	/** Valid transaction hash if authorized */
	txHash?: `0x${string}`
}

/**
 * Prepares a GateConfig by initializing default ReplayProtection and VerificationCoalescer
 * if they are not already provided. This ensures state persistence across requests
 * when the same config object is used.
 *
 * @param config - Base configuration
 * @returns Config with initialized defaults
 */
export function prepareGateConfig<T extends GateConfig>(config: T): T {
	return {
		...config,
		replayCache:
			config.replayCache ||
			new ReplayProtection((config.allowedAgeSeconds || 300) * 1000),
		coalescer: config.coalescer || new VerificationCoalescer(),
	}
}

/**
 * Generic handler for 402 Payment Required challenges.
 * This function is framework-agnostic and should be called with a config
 * that has been initialized via `prepareGateConfig`.
 *
 * @param authHeader - The 'Authorization' header value
 * @param config - Gate configuration (should be prepared)
 * @returns Verification result
 */
export async function handle402Request(
	authHeader: string | undefined | null,
	config: GateConfig,
): Promise<VerificationResult> {
	// 1. Validate configuration
	validateGateConfig(config as any)

	const replayCache = config.replayCache
	const coalescer = config.coalescer

	if (!replayCache || !coalescer) {
		throw new Error(
			'GateConfig must be prepared via prepareGateConfig before calling handle402Request',
		)
	}

	// 2. Check for Tempo authorization
	if (authHeader?.startsWith('Tempo ')) {
		const txHash = authHeader.split(' ')[1] as `0x${string}`

		// Validate hash format
		if (!isValidTxHash(txHash)) {
			return {
				status: 400,
				authorized: false,
				body: {
					error: 'Bad Request',
					code: 'INVALID_TX_HASH',
					message: 'Invalid transaction hash format',
				},
			}
		}

		// Check for replay attack
		if (!replayCache.markUsed(txHash)) {
			config.logger?.warn('Transaction replay detected', { txHash })
			return {
				status: 402,
				authorized: false,
				body: {
					error: 'Payment Required',
					code: 'REPLAY_ERROR',
					message: 'This transaction has already been used',
				},
			}
		}

		try {
			// Coalesce concurrent requests and verify
			const isValid = await coalescer.verify(txHash, () =>
				verifyPaymentHash(txHash, {
					recipient: config.recipient,
					amount: config.amount,
					token: config.token || ALPHA_USD_ADDRESS,
					rpcUrl: config.rpcUrl,
					maxAgeSeconds: config.allowedAgeSeconds,
					logger: config.logger,
				}),
			)

			if (isValid) {
				return { status: 200, authorized: true, body: { txHash }, txHash }
			}
		} catch (error) {
			config.logger?.error('Payment verification infrastructure error', {
				error,
				txHash,
			})
			return {
				status: 503,
				authorized: false,
				body: {
					error: 'Service Temporarily Unavailable',
					code: 'NETWORK_ERROR',
					message: 'Payment verification failed due to infrastructure error',
				},
			}
		}
	}

	// 3. Unauthorized - Return 402 with challenge
	const token = config.token || ALPHA_USD_ADDRESS
	return {
		status: 402,
		authorized: false,
		headers: {
			'WWW-Authenticate': `Tempo realm="Tempo API", asset="${token}", amount="${config.amount}", destination="${config.recipient}"`,
		},
		body: {
			error: 'Payment Required',
			code: 'PAYMENT_REQUIRED',
			paymentInfo: {
				method: 'tempo',
				recipient: config.recipient,
				amount: config.amount,
				token,
			},
		},
	}
}
