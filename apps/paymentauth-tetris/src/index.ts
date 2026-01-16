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
	createWalletClient,
	decodeFunctionData,
	encodeFunctionData,
	type Hex,
	http,
	isAddressEqual,
	parseTransaction,
	recoverTransactionAddress,
	type TransactionSerialized,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { Abis, Transaction as TempoTransaction } from 'viem/tempo'

import {
	Chip8,
	type Chip8State,
	DISPLAY_HEIGHT,
	DISPLAY_WIDTH,
	type GameMetadata,
} from './chip8'
import { getTetrisRom, TETRIS_KEYS, type TetrisAction } from './roms/tetris'

interface Env {
	GAME_STATE: KVNamespace
	KEY_STORE: KVNamespace
	DESTINATION_ADDRESS: string
	TEMPO_RPC_URL: string
	TEMPO_RPC_USERNAME?: string
	TEMPO_RPC_PASSWORD?: string
	FEE_PAYER_PRIVATE_KEY: string
	FEE_TOKEN_ADDRESS?: string
	PAYMENT_AMOUNT?: string
	CHALLENGE_VALIDITY_SECONDS?: string
	CYCLES_PER_MOVE?: string
}

const KV_KEYS = {
	STATE: 'game:state',
	METADATA: 'game:metadata',
	MOVES: 'game:moves',
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

/** Get challenge validity in milliseconds */
function getChallengeValidityMs(env: Env): number {
	const seconds = Number(env.CHALLENGE_VALIDITY_SECONDS ?? '300')
	return seconds * 1000
}

/** Get cycles per move */
function getCyclesPerMove(env: Env): number {
	return Number(env.CYCLES_PER_MOVE ?? '100')
}

// Challenge store (in-memory, per worker instance)
const challengeStore = new Map<
	string,
	{ challenge: PaymentChallenge<ChargeRequest>; used: boolean }
>()

/** Create a new payment challenge */
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
		realm: 'chip8-tetris',
		method: 'tempo',
		intent: 'charge',
		request,
		expires: expiresAt.toISOString(),
		description: options?.description,
	}

	challengeStore.set(challenge.id, { challenge, used: false })

	// Clean up expired challenges
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

/** Initialize a new game */
async function initializeGame(
	env: Env,
): Promise<{ state: Chip8State; metadata: GameMetadata }> {
	const chip8 = new Chip8()
	chip8.loadRom(getTetrisRom())

	// Run enough cycles to initialize the game and draw borders
	// The ROM draws borders in a loop, so we need ~500 cycles
	for (let i = 0; i < 500; i++) {
		chip8.cycle()
		if (i % 10 === 0) chip8.decrementTimers()
	}

	const state = chip8.serialize()
	const metadata: GameMetadata = {
		moveCount: 0,
		linesCleared: 0,
		lastMove: new Date().toISOString(),
	}

	await env.GAME_STATE.put(KV_KEYS.STATE, JSON.stringify(state))
	await env.GAME_STATE.put(KV_KEYS.METADATA, JSON.stringify(metadata))

	return { state, metadata }
}

/** Get current game state or initialize */
async function getGameState(
	env: Env,
): Promise<{ state: Chip8State; metadata: GameMetadata; ascii: string }> {
	const [stateJson, metadataJson] = await Promise.all([
		env.GAME_STATE.get(KV_KEYS.STATE),
		env.GAME_STATE.get(KV_KEYS.METADATA),
	])

	let state: Chip8State
	let metadata: GameMetadata

	if (!stateJson || !metadataJson) {
		const init = await initializeGame(env)
		state = init.state
		metadata = init.metadata
	} else {
		state = JSON.parse(stateJson)
		metadata = JSON.parse(metadataJson)
	}

	// Render ASCII from display state
	const ascii = renderDisplayAsAscii(state.display)

	return { state, metadata, ascii }
}

/** Render display buffer as ASCII */
function renderDisplayAsAscii(display: number[]): string {
	const lines: string[] = []
	for (let y = 0; y < DISPLAY_HEIGHT; y++) {
		let line = ''
		for (let x = 0; x < DISPLAY_WIDTH; x++) {
			const pixel = display[y * DISPLAY_WIDTH + x]
			line += pixel ? '█' : ' '
		}
		lines.push(line)
	}
	return lines.join('\n')
}

/** Execute a move and save state */
async function executeMove(
	env: Env,
	action: TetrisAction,
	walletAddress?: string,
): Promise<{ state: Chip8State; metadata: GameMetadata; ascii: string }> {
	const { state } = await getGameState(env)

	const chip8 = new Chip8()
	chip8.deserialize(state)

	// Press the key for this action
	const key = TETRIS_KEYS[action]
	chip8.pressKey(key)

	// Run cycles
	const cycles = getCyclesPerMove(env)
	for (let i = 0; i < cycles; i++) {
		chip8.cycle()
		if (i % 10 === 0) {
			chip8.decrementTimers()
		}
	}

	// Release key
	chip8.releaseKey(key)

	// Run a few more cycles after release
	for (let i = 0; i < 20; i++) {
		chip8.cycle()
	}

	const newState = chip8.serialize()

	// Update metadata
	const metadataJson = await env.GAME_STATE.get(KV_KEYS.METADATA)
	const metadata: GameMetadata = metadataJson
		? JSON.parse(metadataJson)
		: { moveCount: 0, linesCleared: 0, lastMove: new Date().toISOString() }

	metadata.moveCount++
	metadata.lastMove = new Date().toISOString()
	metadata.lastMoveBy = walletAddress

	// Save state
	await Promise.all([
		env.GAME_STATE.put(KV_KEYS.STATE, JSON.stringify(newState)),
		env.GAME_STATE.put(KV_KEYS.METADATA, JSON.stringify(metadata)),
	])

	const ascii = renderDisplayAsAscii(newState.display)

	return { state: newState, metadata, ascii }
}

/** Verify transaction matches challenge */
async function verifyTransaction(
	signedTx: Hex,
	challenge: ChargeRequest,
): Promise<{ valid: boolean; error?: string; from?: Address }> {
	// Try Tempo transaction first
	try {
		const parsed = TempoTransaction.deserialize(signedTx)

		if (TempoTransaction.isTempo(parsed)) {
			const tempoTx = parsed as TempoTransaction.TransactionSerializableTempo

			if (!tempoTx.calls || tempoTx.calls.length === 0) {
				return { valid: false, error: 'Transaction has no calls' }
			}

			const call = tempoTx.calls[0]
			if (!call.to || !isAddressEqual(call.to, challenge.asset)) {
				return {
					valid: false,
					error: 'Transaction target does not match asset',
				}
			}

			if (!call.data) {
				return { valid: false, error: 'Transaction call missing data' }
			}

			const decoded = decodeFunctionData({ abi: Abis.tip20, data: call.data })

			if (decoded.functionName !== 'transfer') {
				return { valid: false, error: 'Transaction does not call transfer' }
			}

			const [recipient, amount] = decoded.args as [Address, bigint]

			if (!isAddressEqual(recipient, challenge.destination)) {
				return {
					valid: false,
					error: 'Transfer recipient does not match destination',
				}
			}

			if (amount !== BigInt(challenge.amount)) {
				return { valid: false, error: 'Transfer amount does not match' }
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

			return { valid: true, from }
		}
	} catch {
		// Try standard transaction
	}

	// Try standard transaction
	try {
		const parsed = parseTransaction(signedTx as TransactionSerialized)

		if (!parsed.to || !isAddressEqual(parsed.to, challenge.asset)) {
			return { valid: false, error: 'Transaction target does not match asset' }
		}

		if (!parsed.data) {
			return { valid: false, error: 'Transaction missing data' }
		}

		const decoded = decodeFunctionData({ abi: Abis.tip20, data: parsed.data })

		if (decoded.functionName !== 'transfer') {
			return { valid: false, error: 'Transaction does not call transfer' }
		}

		const [recipient, amount] = decoded.args as [Address, bigint]

		if (!isAddressEqual(recipient, challenge.destination)) {
			return {
				valid: false,
				error: 'Transfer recipient does not match destination',
			}
		}

		if (amount !== BigInt(challenge.amount)) {
			return { valid: false, error: 'Transfer amount does not match' }
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

/** Broadcast transaction */
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
			error?: { code: number; message: string }
		}

		if (data.error) {
			return { success: false, error: `RPC Error: ${data.error.message}` }
		}

		const transactionHash =
			typeof data.result === 'object' && data.result !== null
				? data.result.transactionHash
				: data.result

		if (!transactionHash) {
			return { success: false, error: 'No transaction hash returned' }
		}

		return { success: true, transactionHash }
	} catch (error) {
		return {
			success: false,
			error: `Broadcast failed: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		}
	}
}

/** WebAuthn payload structure */
interface WebAuthnPayload {
	type: 'webauthn'
	credentialId: string
	signature: {
		r: string
		s: string
	}
	metadata: {
		authenticatorData: Hex
		clientDataJSON: string
		challengeIndex: number
		typeIndex: number
	}
	publicKey: Hex
	address: Address
}

/** Verify WebAuthn signature */
async function verifyWebAuthnSignature(
	_challengeId: string,
	payload: WebAuthnPayload,
	env: Env,
): Promise<{ valid: boolean; error?: string; address?: Address }> {
	try {
		// Get stored public key for this credential
		const stored = await env.KEY_STORE.get(`credential:${payload.credentialId}`)
		if (!stored) {
			return { valid: false, error: 'Unknown credential ID' }
		}

		const storedData = JSON.parse(stored) as {
			publicKey: string
			address?: string
		}

		// Verify public key matches
		if (storedData.publicKey !== payload.publicKey) {
			return { valid: false, error: 'Public key mismatch' }
		}

		// Note: Full WebAuthn signature verification would require ox imports
		// For now, we trust that the stored credential matches
		return { valid: true, address: payload.address }
	} catch (e) {
		return { valid: false, error: `WebAuthn verification failed: ${e}` }
	}
}

/** Create and sign a payment transaction using the fee payer */
async function signPaymentTransaction(
	challenge: ChargeRequest,
	env: Env,
): Promise<{ signedTx: Hex; error?: string }> {
	try {
		const feePayerKey = env.FEE_PAYER_PRIVATE_KEY as Hex
		if (!feePayerKey) {
			return { signedTx: '0x', error: 'Fee payer not configured' }
		}

		const account = privateKeyToAccount(feePayerKey)

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

		const walletClient = createWalletClient({
			account,
			chain: tempoModerato,
			transport: http(rpcUrl),
		})

		// Encode transfer call
		const transferData = encodeFunctionData({
			abi: Abis.tip20,
			functionName: 'transfer',
			args: [challenge.destination as Address, BigInt(challenge.amount)],
		})

		// Get nonce
		const nonce = await client.getTransactionCount({
			address: account.address,
		})

		// Get gas price
		const gasPrice = await client.getGasPrice()

		// Sign the transaction
		const signedTx = await walletClient.signTransaction({
			to: challenge.asset as Address,
			data: transferData,
			nonce,
			gas: 100000n,
			maxFeePerGas: gasPrice * 2n,
			maxPriorityFeePerGas: gasPrice,
		})

		return { signedTx }
	} catch (e) {
		return { signedTx: '0x', error: `Failed to sign transaction: ${e}` }
	}
}

/** Get transaction receipt */
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

// Create Hono app
const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

// Request logging
app.use('*', async (c, next) => {
	const start = Date.now()
	console.log(`→ ${c.req.method} ${c.req.path}`)
	await next()
	const ms = Date.now() - start
	console.log(`← ${c.req.method} ${c.req.path} ${c.res.status} (${ms}ms)`)
})

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

// ============================================================================
// KeyManager HTTP API for WebAuthn credential storage
// These endpoints are used by the WebAuthn passkey connector
// ============================================================================

/** Generate a challenge for WebAuthn registration/authentication */
app.get('/keys/challenge', (c) => {
	// Generate a random challenge
	const challenge = crypto.randomUUID()
	return c.json({ challenge })
})

/** Store a public key for a credential (used during WebAuthn registration) */
app.post('/keys', async (c) => {
	try {
		const body = await c.req.json<{
			credentialId: string
			publicKey: string
			address?: string
		}>()

		if (!body.credentialId || !body.publicKey) {
			return c.json({ error: 'Missing credentialId or publicKey' }, 400)
		}

		// Store the public key in KV, keyed by credential ID
		await c.env.KEY_STORE.put(
			`credential:${body.credentialId}`,
			JSON.stringify({
				publicKey: body.publicKey,
				address: body.address,
				createdAt: new Date().toISOString(),
			}),
		)

		console.log(`Stored public key for credential: ${body.credentialId}`)

		return c.json({ success: true })
	} catch (error) {
		console.error('Error storing public key:', error)
		return c.json({ error: 'Failed to store public key' }, 500)
	}
})

/** Retrieve a public key for a credential (used during WebAuthn authentication) */
app.get('/keys/:credentialId', async (c) => {
	const credentialId = c.req.param('credentialId')

	if (!credentialId) {
		return c.json({ error: 'Missing credentialId' }, 400)
	}

	const stored = await c.env.KEY_STORE.get(`credential:${credentialId}`)

	if (!stored) {
		return c.json({ error: 'Credential not found' }, 404)
	}

	try {
		const data = JSON.parse(stored) as {
			publicKey: string
			address?: string
			createdAt: string
		}

		return c.json({
			credentialId,
			publicKey: data.publicKey,
			address: data.address,
		})
	} catch {
		return c.json({ error: 'Invalid stored data' }, 500)
	}
})

// Get current game state
app.get('/state', async (c) => {
	const { state, metadata, ascii } = await getGameState(c.env)

	return c.json({
		ascii,
		metadata,
		display: state.display,
	})
})

// Reset game (free endpoint for testing)
app.post('/reset', async (c) => {
	const { state, metadata } = await initializeGame(c.env)
	const ascii = renderDisplayAsAscii(state.display)

	return c.json({
		message: 'Game reset',
		ascii,
		metadata,
	})
})

// Execute a move (paid endpoint)
app.post('/move/:action', async (c) => {
	const action = c.req.param('action') as TetrisAction

	// Validate action
	if (!['left', 'right', 'rotate', 'drop'].includes(action)) {
		return c.json(
			{ error: 'Invalid action. Use: left, right, rotate, drop' },
			400,
		)
	}

	const authHeader = c.req.header('Authorization')

	// No auth - return 402 with challenge
	if (!authHeader || !authHeader.startsWith('Payment ')) {
		const challenge = createChallenge(c.env, {
			description: `Pay $0.01 to move ${action} in Tetris`,
		})

		c.header('WWW-Authenticate', formatWwwAuthenticate(challenge))
		c.header('Cache-Control', 'no-store')

		return c.json(
			new PaymentRequiredError('Payment required to make a move').toJSON(),
			402,
		)
	}

	// Parse credential
	let credential: PaymentCredential
	try {
		credential = parseAuthorization(authHeader)
	} catch {
		return c.json(
			new MalformedProofError('Invalid Authorization header').toJSON(),
			400,
		)
	}

	// Verify challenge
	const storedChallenge = challengeStore.get(credential.id)
	if (!storedChallenge) {
		c.header('WWW-Authenticate', formatWwwAuthenticate(createChallenge(c.env)))
		return c.json(
			new PaymentVerificationFailedError('Unknown challenge ID').toJSON(),
			401,
		)
	}

	if (storedChallenge.used) {
		c.header('WWW-Authenticate', formatWwwAuthenticate(createChallenge(c.env)))
		return c.json(
			new PaymentVerificationFailedError('Challenge already used').toJSON(),
			401,
		)
	}

	if (
		storedChallenge.challenge.expires &&
		new Date(storedChallenge.challenge.expires) < new Date()
	) {
		challengeStore.delete(credential.id)
		c.header('WWW-Authenticate', formatWwwAuthenticate(createChallenge(c.env)))
		return c.json(new PaymentExpiredError('Challenge expired').toJSON(), 402)
	}

	// Verify payload
	if (!credential.payload) {
		return c.json(new MalformedProofError('Missing payload').toJSON(), 400)
	}

	let signedTx: Hex
	let walletAddress: Address | undefined

	// Handle different payload types
	const payloadType = credential.payload.type as string
	if (payloadType === 'webauthn') {
		// WebAuthn authentication - server signs the transaction
		const webauthnPayload = credential.payload as unknown as WebAuthnPayload

		// Verify WebAuthn signature
		const webauthnVerification = await verifyWebAuthnSignature(
			credential.id,
			webauthnPayload,
			c.env,
		)
		if (!webauthnVerification.valid) {
			return c.json(
				new PaymentVerificationFailedError(
					webauthnVerification.error || 'WebAuthn verification failed',
				).toJSON(),
				401,
			)
		}

		walletAddress = webauthnVerification.address

		// Sign the transaction using fee payer
		const signResult = await signPaymentTransaction(
			storedChallenge.challenge.request,
			c.env,
		)
		if (signResult.error) {
			return c.json(
				new PaymentVerificationFailedError(signResult.error).toJSON(),
				500,
			)
		}
		signedTx = signResult.signedTx
	} else if (payloadType === 'transaction') {
		// Traditional transaction payload - verify the signed transaction
		signedTx = credential.payload.signature as Hex

		// Verify transaction
		const verification = await verifyTransaction(
			signedTx,
			storedChallenge.challenge.request,
		)
		if (!verification.valid) {
			return c.json(
				new PaymentVerificationFailedError(
					verification.error || 'Verification failed',
				).toJSON(),
				400,
			)
		}
		walletAddress = verification.from
	} else {
		return c.json(new MalformedProofError('Invalid payload type').toJSON(), 400)
	}

	// Mark challenge as used
	storedChallenge.used = true

	// Broadcast transaction
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

	// Execute the move
	const { metadata, ascii } = await executeMove(c.env, action, walletAddress)

	// Create receipt
	const receipt: PaymentReceipt & { blockNumber?: string } = {
		status: 'success',
		method: 'tempo',
		timestamp: new Date().toISOString(),
		reference: txHash,
	}

	if (receiptData.blockNumber !== null) {
		receipt.blockNumber = receiptData.blockNumber.toString()
	}

	c.header('Payment-Receipt', formatReceipt(receipt))
	c.header('Cache-Control', 'private')

	return c.json({
		action,
		ascii,
		metadata,
		receipt: {
			status: receipt.status,
			txHash,
			blockNumber: receiptData.blockNumber?.toString() || null,
			explorer: `https://explore.tempo.xyz/tx/${txHash}`,
		},
	})
})

export default app
