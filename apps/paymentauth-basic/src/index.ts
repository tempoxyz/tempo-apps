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
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
	type Address,
	createPublicClient,
	decodeFunctionData,
	type Hex,
	http,
	isAddressEqual,
	parseTransaction,
	recoverTransactionAddress,
	type TransactionSerialized,
} from 'viem'
import { tempoModerato } from 'viem/chains'
import { Abis, Transaction as TempoTransaction } from 'viem/tempo'

interface Env {
	/** Destination wallet address for payments */
	DESTINATION_ADDRESS: string
	/** Tempo RPC URL */
	TEMPO_RPC_URL: string
	/** Optional: RPC username for authenticated endpoints */
	TEMPO_RPC_USERNAME?: string
	/** Optional: RPC password for authenticated endpoints */
	TEMPO_RPC_PASSWORD?: string
	/** Private key for the fee payer wallet (0x-prefixed) */
	FEE_PAYER_PRIVATE_KEY: string
	/** Fee token address (default: AlphaUSD) */
	FEE_TOKEN_ADDRESS?: string
	/** Payment amount in base units (default: 10000 = 0.01 with 6 decimals) */
	PAYMENT_AMOUNT?: string
	/** Challenge validity in seconds (default: 300 = 5 minutes) */
	CHALLENGE_VALIDITY_SECONDS?: string
}

/** Get fee token address from env or use default AlphaUSD */
function getFeeTokenAddress(env: Env): Address {
	return (
		(env.FEE_TOKEN_ADDRESS as Address) ??
		'0x20c0000000000000000000000000000000000001'
	)
}

/** Get payment amount from env or use default (0.01 USD = 10000 base units) */
function getPaymentAmount(env: Env): string {
	return env.PAYMENT_AMOUNT ?? '10000'
}

/** Get challenge validity in milliseconds from env or use default (5 minutes) */
function getChallengeValidityMs(env: Env): number {
	const seconds = Number(env.CHALLENGE_VALIDITY_SECONDS ?? '300')
	return seconds * 1000
}

const challengeStore = new Map<
	string,
	{ challenge: PaymentChallenge<ChargeRequest>; used: boolean }
>()

/**
 * Create a new payment challenge and store it.
 */
function createChallenge(
	env: Env,
	options?: { description?: string },
): PaymentChallenge<ChargeRequest> {
	const destinationAddress = env.DESTINATION_ADDRESS as Address
	const expiresAt = new Date(Date.now() + getChallengeValidityMs(env))

	const request: ChargeRequest = {
		amount: getPaymentAmount(env),
		asset: getFeeTokenAddress(env),
		destination: destinationAddress,
		expires: expiresAt.toISOString(),
	}

	const challenge: PaymentChallenge<ChargeRequest> = {
		id: generateChallengeId(),
		realm: 'basic',
		method: 'tempo',
		intent: 'charge',
		request,
		expires: expiresAt.toISOString(),
		description: options?.description,
	}

	challengeStore.set(challenge.id, { challenge, used: false })

	for (const [id, entry] of challengeStore) {
		if (
			entry.challenge.expires &&
			new Date(entry.challenge.expires) < new Date()
		) {
			challengeStore.delete(id)
		}
	}

	return challenge
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

// Request logging middleware
app.use('*', async (c, next) => {
	const start = Date.now()
	console.log(`→ ${c.req.method} ${c.req.path}`)
	await next()
	const ms = Date.now() - start
	console.log(`← ${c.req.method} ${c.req.path} ${c.res.status} (${ms}ms)`)
})

app.get('/health', (c) => c.json({ status: 'ok' }))

/**
 * GET /ping - Free endpoint
 * Returns a simple pong response without payment.
 */
app.get('/ping', (c) => {
	return c.json({
		message: 'pong',
		paid: false,
		timestamp: new Date().toISOString(),
	})
})

/**
 * Verify that a signed transaction matches the payment challenge.
 * Supports both Tempo (0x76) and legacy/EIP-1559 transactions.
 */
async function verifyTransaction(
	signedTx: Hex,
	challenge: ChargeRequest,
): Promise<{
	valid: boolean
	error?: string
	from?: Address
	tx?: TempoTransaction.TransactionSerializableTempo
}> {
	// Try Tempo transaction first
	const tempoResult = await verifyTempoTransaction(signedTx, challenge)
	if (tempoResult.valid) {
		return tempoResult
	}

	// Fall back to standard transaction (legacy/EIP-1559)
	const standardResult = await verifyStandardTransaction(signedTx, challenge)
	if (standardResult.valid) {
		return standardResult
	}

	// Return the more informative error
	return tempoResult.error?.includes('Failed to parse')
		? standardResult
		: tempoResult
}

/**
 * Verify a Tempo (type 0x76) transaction.
 */
async function verifyTempoTransaction(
	signedTx: Hex,
	challenge: ChargeRequest,
): Promise<{
	valid: boolean
	error?: string
	from?: Address
	tx?: TempoTransaction.TransactionSerializableTempo
}> {
	try {
		const parsed = TempoTransaction.deserialize(signedTx)

		if (!TempoTransaction.isTempo(parsed)) {
			return { valid: false, error: 'Transaction is not a Tempo transaction' }
		}

		const tempoTx = parsed as TempoTransaction.TransactionSerializableTempo

		if (!tempoTx.calls || tempoTx.calls.length === 0) {
			return { valid: false, error: 'Transaction has no calls' }
		}

		const call = tempoTx.calls[0]
		if (!call.to) {
			return { valid: false, error: 'Transaction call missing "to" field' }
		}

		if (!isAddressEqual(call.to, challenge.asset)) {
			return {
				valid: false,
				error: `Transaction target ${call.to} does not match asset ${challenge.asset}`,
			}
		}

		if (!call.data) {
			return { valid: false, error: 'Transaction call missing data' }
		}

		try {
			const decoded = decodeFunctionData({
				abi: Abis.tip20,
				data: call.data,
			})

			if (decoded.functionName !== 'transfer') {
				return {
					valid: false,
					error: 'Transaction does not call transfer function',
				}
			}

			const [recipient, amount] = decoded.args as [Address, bigint]

			if (!isAddressEqual(recipient, challenge.destination)) {
				return {
					valid: false,
					error: `Transfer recipient ${recipient} does not match destination ${challenge.destination}`,
				}
			}

			const expectedAmount = BigInt(challenge.amount)
			if (amount !== expectedAmount) {
				return {
					valid: false,
					error: `Transfer amount ${amount} does not match expected ${expectedAmount}`,
				}
			}
		} catch (e) {
			return { valid: false, error: `Failed to decode transfer data: ${e}` }
		}

		let from: Address | undefined
		try {
			from = await recoverTransactionAddress({
				serializedTransaction: signedTx,
				serializer: TempoTransaction.serialize,
			} as Parameters<typeof recoverTransactionAddress>[0])
		} catch {
			from = (tempoTx as { from?: Address }).from
		}

		return { valid: true, from, tx: tempoTx }
	} catch (e) {
		return { valid: false, error: `Failed to parse Tempo transaction: ${e}` }
	}
}

/**
 * Verify a standard (legacy/EIP-1559) transaction.
 */
async function verifyStandardTransaction(
	signedTx: Hex,
	challenge: ChargeRequest,
): Promise<{
	valid: boolean
	error?: string
	from?: Address
}> {
	try {
		const parsed = parseTransaction(signedTx as TransactionSerialized)

		if (!parsed.to) {
			return { valid: false, error: 'Transaction missing "to" field' }
		}

		if (!isAddressEqual(parsed.to, challenge.asset)) {
			return {
				valid: false,
				error: `Transaction target ${parsed.to} does not match asset ${challenge.asset}`,
			}
		}

		if (!parsed.data) {
			return { valid: false, error: 'Transaction missing data' }
		}

		try {
			const decoded = decodeFunctionData({
				abi: Abis.tip20,
				data: parsed.data,
			})

			if (decoded.functionName !== 'transfer') {
				return {
					valid: false,
					error: 'Transaction does not call transfer function',
				}
			}

			const [recipient, amount] = decoded.args as [Address, bigint]

			if (!isAddressEqual(recipient, challenge.destination)) {
				return {
					valid: false,
					error: `Transfer recipient ${recipient} does not match destination ${challenge.destination}`,
				}
			}

			const expectedAmount = BigInt(challenge.amount)
			if (amount !== expectedAmount) {
				return {
					valid: false,
					error: `Transfer amount ${amount} does not match expected ${expectedAmount}`,
				}
			}
		} catch (e) {
			return { valid: false, error: `Failed to decode transfer data: ${e}` }
		}

		let from: Address | undefined
		try {
			from = await recoverTransactionAddress({
				serializedTransaction: signedTx as TransactionSerialized,
			})
		} catch {}

		return { valid: true, from }
	} catch (e) {
		return { valid: false, error: `Failed to parse transaction: ${e}` }
	}
}

/**
 * Broadcast the client's signed transaction directly to the RPC.
 * The client pays for their own transaction fees.
 */
async function broadcastTransaction(
	signedTx: Hex,
	env: Env,
): Promise<
	{ success: true; transactionHash: Hex } | { success: false; error: string }
> {
	try {
		let rpcUrl = env.TEMPO_RPC_URL
		if (env.TEMPO_RPC_USERNAME && env.TEMPO_RPC_PASSWORD) {
			const url = new URL(rpcUrl)
			url.username = env.TEMPO_RPC_USERNAME
			url.password = env.TEMPO_RPC_PASSWORD
			rpcUrl = url.toString()
		}

		const response = await fetch(rpcUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'eth_sendRawTransaction',
				params: [signedTx],
			}),
		})

		const data = (await response.json()) as {
			result?: { transactionHash: Hex } | Hex
			error?: { code: number; message: string; data?: unknown }
		}

		if (data.error) {
			return {
				success: false,
				error: `RPC Error (${data.error.code}): ${
					data.error.message || 'Transaction broadcast failed'
				}`,
			}
		}

		const transactionHash =
			typeof data.result === 'object' && data.result !== null
				? data.result.transactionHash
				: data.result

		if (!transactionHash) {
			return {
				success: false,
				error: 'No transaction hash returned from RPC',
			}
		}

		return { success: true, transactionHash }
	} catch (error) {
		return {
			success: false,
			error: `Failed to broadcast transaction: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		}
	}
}

/**
 * Get transaction receipt with block number.
 */
async function getTransactionReceipt(
	txHash: Hex,
	env: Env,
): Promise<{ blockNumber: bigint | null }> {
	try {
		let rpcUrl = env.TEMPO_RPC_URL
		if (env.TEMPO_RPC_USERNAME && env.TEMPO_RPC_PASSWORD) {
			const url = new URL(rpcUrl)
			url.username = env.TEMPO_RPC_USERNAME
			url.password = env.TEMPO_RPC_PASSWORD
			rpcUrl = url.toString()
		}

		const client = createPublicClient({
			chain: tempoModerato,
			transport: http(rpcUrl),
		})

		const receipt = await client.waitForTransactionReceipt({
			hash: txHash,
			timeout: 30_000,
		})

		return { blockNumber: receipt.blockNumber }
	} catch {
		return { blockNumber: null }
	}
}

/**
 * GET /ping/paid - Paid endpoint (0.01 USD on Tempo)
 *
 * Flow:
 * 1. Client requests without Authorization header -> 402 with WWW-Authenticate
 * 2. Client signs payment and retries with Authorization: Payment <credential>
 * 3. Server verifies, adds fee payer signature, broadcasts, and returns Payment-Receipt
 */
app.get('/ping/paid', async (c) => {
	const authHeader = c.req.header('Authorization')

	if (!authHeader || !authHeader.startsWith('Payment ')) {
		const challenge = createChallenge(c.env, {
			description: 'Pay 0.01 USD to access the paid ping endpoint',
		})

		c.header('WWW-Authenticate', formatWwwAuthenticate(challenge))
		c.header('Cache-Control', 'no-store')

		return c.json(
			new PaymentRequiredError(
				'Payment of 0.01 USD required to access this endpoint',
			).toJSON(),
			402,
		)
	}

	let credential: PaymentCredential
	try {
		credential = parseAuthorization(authHeader)
	} catch {
		return c.json(
			new MalformedProofError('Invalid Authorization header format').toJSON(),
			400,
		)
	}

	const storedChallenge = challengeStore.get(credential.id)
	if (!storedChallenge) {
		c.header('WWW-Authenticate', formatWwwAuthenticate(createChallenge(c.env)))
		return c.json(
			new PaymentVerificationFailedError(
				'Unknown or expired challenge ID',
			).toJSON(),
			401,
		)
	}

	if (storedChallenge.used) {
		c.header('WWW-Authenticate', formatWwwAuthenticate(createChallenge(c.env)))
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
		c.header('WWW-Authenticate', formatWwwAuthenticate(createChallenge(c.env)))
		return c.json(
			new PaymentExpiredError('Challenge has expired').toJSON(),
			402,
		)
	}

	if (
		!credential.payload ||
		!['transaction', 'keyAuthorization'].includes(credential.payload.type)
	) {
		return c.json(new MalformedProofError('Invalid payload type').toJSON(), 400)
	}

	const signedTx = credential.payload.signature as Hex
	const timestamp = new Date().toISOString()

	const verification = await verifyTransaction(
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

	const broadcastResult = await broadcastTransaction(signedTx, c.env)

	if (!broadcastResult.success) {
		storedChallenge.used = false
		return c.json(
			new PaymentVerificationFailedError(
				`Broadcast failed: ${broadcastResult.error}`,
			).toJSON(),
			500,
		)
	}

	const txHash = broadcastResult.transactionHash
	const receiptData = await getTransactionReceipt(txHash, c.env)
	const blockNumber = receiptData.blockNumber

	const receipt: PaymentReceipt & { blockNumber?: string } = {
		status: 'success',
		method: 'tempo',
		timestamp,
		reference: txHash,
	}

	if (blockNumber !== null) {
		receipt.blockNumber = blockNumber.toString()
	}

	c.header('Payment-Receipt', formatReceipt(receipt))
	c.header('Cache-Control', 'private')

	return c.json({
		message: 'pong (paid!)',
		paid: true,
		timestamp,
		receipt: {
			status: receipt.status,
			txHash,
			blockNumber: blockNumber?.toString() || null,
			explorer: `https://explore.tempo.xyz/tx/${txHash}`,
		},
	})
})

export default app
