import {
	ALPHA_USD_ADDRESS,
	loadConfigFromEnv,
	ReplayError,
	NetworkError,
	isValidTxHash,
	verifyPaymentHash,
} from '@tempo/402-common'
import type { BaseGateConfig } from './types'

/**
 * Agnostic result of a 402 challenge verification.
 */
export type HandleResult =
	| { type: 'success'; txHash: `0x${string}` }
	| {
		type: 'challenge'
		status: 402
		body: any
		headers: Record<string, string>
	}
	| { type: 'error'; status: 400 | 503; body: any }

/**
 * Core logic for 402 payment verification.
 * Isolates framework-specific logic from the core verification protocol.
 */
export async function handle402Request(
	authHeader: string | undefined | null,
	config: BaseGateConfig,
): Promise<HandleResult> {
	const envConfig = loadConfigFromEnv()
	const finalConfig = { ...envConfig, ...config }
	const { recipient, amount, rpcUrl, token = ALPHA_USD_ADDRESS } = finalConfig

	if (!recipient || !amount || !rpcUrl) {
		return {
			type: 'error',
			status: 503,
			body: {
				error: 'Service Unavailable',
				message: 'Payment gateway misconfigured',
			},
		}
	}

	if (!authHeader?.startsWith('Tempo ')) {
		return {
			type: 'challenge',
			status: 402,
			headers: {
				'WWW-Authenticate': `Tempo realm="Tempo API", asset="${token}", amount="${amount}", destination="${recipient}"`,
			},
			body: {
				error: 'Payment Required',
				paymentInfo: { method: 'tempo', recipient, amount, token },
			},
		}
	}

	const txHash = authHeader.split(' ')[1] as `0x${string}`

	if (!isValidTxHash(txHash)) {
		return {
			type: 'error',
			status: 400,
			body: {
				error: 'Bad Request',
				message: 'Invalid transaction hash format',
				code: 'INVALID_TX_HASH',
			},
		}
	}

	// Verification state must be provided by the caller to ensure persistence
	const replayCache = config.replayCache
	const coalescer = config.coalescer

	if (replayCache) {
		// Support both sync and async implementations
		const result = await replayCache.beginVerification(txHash)
		if (!result) {
			return {
				type: 'challenge',
				status: 402,
				body: new ReplayError(txHash).toJSON(),
				headers: {},
			}
		}
	}

	try {
		// If coalescer is provided, use it. Otherwise call verify directly.
		const runVerify = () =>
			verifyPaymentHash(txHash, {
				recipient,
				amount: amount.toString(),
				token,
				rpcUrl,
				maxAgeSeconds: finalConfig.allowedAgeSeconds,
				confirmations: 1,
			})

		const isValid = coalescer
			? await coalescer.verify(txHash, runVerify)
			: await runVerify()

		if (isValid) {
			if (replayCache) await replayCache.commitVerification(txHash)
			return { type: 'success', txHash }
		} else {
			if (replayCache) await replayCache.rollbackVerification(txHash)
		}
	} catch (error) {
		if (replayCache) await replayCache.rollbackVerification(txHash)
		const networkError = new NetworkError('Verification infra error', {
			originalError: error,
		})
		return { type: 'error', status: 503, body: networkError.toJSON() }
	}

	return {
		type: 'challenge',
		status: 402,
		headers: {},
		body: {
			error: 'Payment Required',
			message: 'Transaction verification failed',
		},
	}
}
