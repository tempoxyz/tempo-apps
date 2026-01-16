import {
	type ChargeRequest,
	formatReceipt,
	formatWwwAuthenticate,
	generateChallengeId,
	MalformedProofError,
	type PaymentChallenge,
	type PaymentCredential,
	PaymentExpiredError,
	type PaymentReceipt,
	PaymentRequiredError,
	PaymentVerificationFailedError,
	parseAuthorization,
} from 'paymentauth-protocol'
import type { Context, MiddlewareHandler } from 'hono'
import type { Hex } from 'viem'
import type { PaymentAuthConfig, PaymentAuthContext } from './types.js'

// In-memory challenge store (in production, use KV or Durable Objects)
const challengeStore = new Map<
	string,
	{ challenge: PaymentChallenge<ChargeRequest>; used: boolean }
>()

/**
 * Clean up expired challenges from the store.
 */
function cleanupExpiredChallenges(): void {
	const now = new Date()
	for (const [id, entry] of challengeStore) {
		if (entry.challenge.expires && new Date(entry.challenge.expires) < now) {
			challengeStore.delete(id)
		}
	}
}

/**
 * Create a new payment challenge.
 */
function createChallenge(
	config: PaymentAuthConfig,
): PaymentChallenge<ChargeRequest> {
	const validityMs = config.challengeValidityMs ?? 300_000 // 5 minutes default
	const expiresAt = new Date(Date.now() + validityMs)

	const request: ChargeRequest = {
		amount: config.amount,
		asset: config.asset,
		destination: config.destination,
		expires: expiresAt.toISOString(),
	}

	const challenge: PaymentChallenge<ChargeRequest> = {
		id: generateChallengeId(),
		realm: config.realm,
		method: config.method,
		intent: 'charge',
		request,
		expires: expiresAt.toISOString(),
		description: config.description,
	}

	challengeStore.set(challenge.id, { challenge, used: false })
	cleanupExpiredChallenges()

	return challenge
}

/**
 * Create a payment auth middleware for Hono.
 *
 * @example
 * ```ts
 * import { paymentAuth } from '@paymentauth/hono'
 *
 * app.get('/paid-endpoint', paymentAuth({
 *   method: 'base',
 *   realm: 'my-app',
 *   destination: '0x...',
 *   asset: '0x...',
 *   amount: '10000',
 *   verify: async (signedTx, request) => { ... },
 *   broadcast: async (signedTx) => { ... },
 * }), (c) => {
 *   const payment = c.get('payment')
 *   return c.json({ message: 'Paid!', txHash: payment.txHash })
 * })
 * ```
 */
export function paymentAuth(config: PaymentAuthConfig): MiddlewareHandler {
	return async (c: Context, next) => {
		const authHeader = c.req.header('Authorization')

		// No authorization header - issue payment challenge
		if (!authHeader || !authHeader.startsWith('Payment ')) {
			const challenge = createChallenge(config)

			c.header('WWW-Authenticate', formatWwwAuthenticate(challenge))
			c.header('Cache-Control', 'no-store')

			return c.json(
				new PaymentRequiredError(
					config.description ?? 'Payment required to access this endpoint',
				).toJSON(),
				402,
			)
		}

		// Parse the payment credential
		let credential: PaymentCredential
		try {
			credential = parseAuthorization(authHeader)
		} catch {
			return c.json(
				new MalformedProofError('Invalid Authorization header format').toJSON(),
				400,
			)
		}

		// Validate the challenge
		const storedChallenge = challengeStore.get(credential.id)
		if (!storedChallenge) {
			c.header(
				'WWW-Authenticate',
				formatWwwAuthenticate(createChallenge(config)),
			)
			return c.json(
				new PaymentVerificationFailedError(
					'Unknown or expired challenge ID',
				).toJSON(),
				401,
			)
		}

		if (storedChallenge.used) {
			c.header(
				'WWW-Authenticate',
				formatWwwAuthenticate(createChallenge(config)),
			)
			return c.json(
				new PaymentVerificationFailedError(
					'Challenge has already been used',
				).toJSON(),
				401,
			)
		}

		if (
			storedChallenge.challenge.expires &&
			new Date(storedChallenge.challenge.expires) < new Date()
		) {
			challengeStore.delete(credential.id)
			c.header(
				'WWW-Authenticate',
				formatWwwAuthenticate(createChallenge(config)),
			)
			return c.json(
				new PaymentExpiredError('Challenge has expired').toJSON(),
				402,
			)
		}

		// Validate payload type
		if (
			!credential.payload ||
			!['transaction', 'keyAuthorization'].includes(credential.payload.type)
		) {
			return c.json(
				new MalformedProofError('Invalid payload type').toJSON(),
				400,
			)
		}

		const signedTx = credential.payload.signature as Hex
		const timestamp = new Date().toISOString()

		const verification = await config.verify(
			signedTx,
			storedChallenge.challenge.request,
		)
		if (!verification.valid) {
			return c.json(
				new PaymentVerificationFailedError(
					verification.error || 'Transaction verification failed',
				).toJSON(),
				400,
			)
		}

		storedChallenge.used = true

		const broadcastResult = await config.broadcast(signedTx)

		if (!broadcastResult.success || !broadcastResult.transactionHash) {
			storedChallenge.used = false
			return c.json(
				new PaymentVerificationFailedError(
					`Broadcast failed: ${broadcastResult.error}`,
				).toJSON(),
				500,
			)
		}

		const txHash = broadcastResult.transactionHash

		let blockNumber: bigint | null = null
		if (config.confirm) {
			const confirmResult = await config.confirm(txHash)
			blockNumber = confirmResult.blockNumber
		}
		const receipt: PaymentReceipt & { blockNumber?: string } = {
			status: 'success',
			method: config.method,
			timestamp,
			reference: txHash,
		}

		if (blockNumber !== null) {
			receipt.blockNumber = blockNumber.toString()
		}

		c.header('Payment-Receipt', formatReceipt(receipt))
		c.header('Cache-Control', 'private')
		const paymentContext: PaymentAuthContext = {
			paid: true,
			receipt,
			txHash,
			blockNumber: blockNumber?.toString() ?? null,
			payer: verification.from,
		}

		c.set('payment', paymentContext)

		await next()
	}
}
