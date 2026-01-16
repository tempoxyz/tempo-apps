import { type PaymentAuthContext, paymentAuth } from 'paymentauth-hono'
import type { ChargeRequest } from 'paymentauth-protocol'
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
import { baseSepolia } from 'viem/chains'

// ERC-20 ABI for transfer function
const erc20Abi = [
	{
		name: 'transfer',
		type: 'function',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [{ name: '', type: 'bool' }],
	},
] as const

interface Env {
	/** Destination wallet address for payments */
	DESTINATION_ADDRESS: string
	/** Base Sepolia RPC URL */
	BASE_RPC_URL: string
	/** Optional: RPC username for authenticated endpoints */
	BASE_RPC_USERNAME?: string
	/** Optional: RPC password for authenticated endpoints */
	BASE_RPC_PASSWORD?: string
	/** Fee token address (default: USDC on Base Sepolia) */
	FEE_TOKEN_ADDRESS?: string
	/** Payment amount in base units (default: 10000 = 0.01 with 6 decimals) */
	PAYMENT_AMOUNT?: string
	/** Challenge validity in seconds (default: 300 = 5 minutes) */
	CHALLENGE_VALIDITY_SECONDS?: string
}

/** Get RPC URL with optional auth */
function getRpcUrl(env: Env): string {
	let rpcUrl = env.BASE_RPC_URL
	if (env.BASE_RPC_USERNAME && env.BASE_RPC_PASSWORD) {
		const url = new URL(rpcUrl)
		url.username = env.BASE_RPC_USERNAME
		url.password = env.BASE_RPC_PASSWORD
		rpcUrl = url.toString()
	}
	return rpcUrl
}

/** Get fee token address from env or use default USDC on Base Sepolia */
function getFeeTokenAddress(env: Env): Address {
	return (
		(env.FEE_TOKEN_ADDRESS as Address) ??
		'0x036CbD53842c5426634e7929541eC2318f3dCF7e'
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

/**
 * Verify that a signed ERC-20 transfer transaction matches the payment request.
 */
async function verifyErc20Transfer(
	signedTx: Hex,
	request: ChargeRequest,
): Promise<{ valid: boolean; error?: string; from?: Address }> {
	try {
		const parsed = parseTransaction(signedTx as TransactionSerialized)

		if (!parsed.to) {
			return { valid: false, error: 'Transaction missing "to" field' }
		}

		if (!isAddressEqual(parsed.to, request.asset)) {
			return {
				valid: false,
				error: `Transaction target ${parsed.to} does not match asset ${request.asset}`,
			}
		}

		if (!parsed.data) {
			return { valid: false, error: 'Transaction missing data' }
		}

		try {
			const decoded = decodeFunctionData({
				abi: erc20Abi,
				data: parsed.data,
			})

			if (decoded.functionName !== 'transfer') {
				return {
					valid: false,
					error: 'Transaction does not call transfer function',
				}
			}

			const [recipient, amount] = decoded.args as [Address, bigint]

			if (!isAddressEqual(recipient, request.destination)) {
				return {
					valid: false,
					error: `Transfer recipient ${recipient} does not match destination ${request.destination}`,
				}
			}

			const expectedAmount = BigInt(request.amount)
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
 * Broadcast transaction to Base Sepolia RPC.
 */
async function broadcastToBase(
	signedTx: Hex,
	rpcUrl: string,
): Promise<{ success: boolean; transactionHash?: Hex; error?: string }> {
	try {
		console.log('  Client signed TX length:', signedTx.length)
		console.log('  Broadcasting to RPC...')

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
			result?: Hex
			error?: { code: number; message: string; data?: unknown }
		}

		console.log('  RPC Response:', JSON.stringify(data))

		if (data.error) {
			console.log('  RPC Error:', data.error.code, data.error.message)
			return {
				success: false,
				error: `RPC Error (${data.error.code}): ${
					data.error.message || 'Transaction broadcast failed'
				}`,
			}
		}

		if (!data.result) {
			return { success: false, error: 'No transaction hash returned from RPC' }
		}

		return { success: true, transactionHash: data.result }
	} catch (error) {
		console.log('  Exception in broadcast:', error)
		return {
			success: false,
			error: `Failed to broadcast: ${error instanceof Error ? error.message : 'Unknown error'}`,
		}
	}
}

/**
 * Wait for transaction confirmation on Base Sepolia.
 */
async function confirmOnBase(
	txHash: Hex,
	rpcUrl: string,
): Promise<{ blockNumber: bigint | null }> {
	try {
		const client = createPublicClient({
			chain: baseSepolia,
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

const app = new Hono<{
	Bindings: Env
	Variables: { payment: PaymentAuthContext }
}>()

// CORS middleware
app.use('*', cors())

// Health check
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
 * GET /ping/paid - Paid endpoint (0.01 USD on Base Sepolia)
 *
 * Uses the paymentAuth middleware to handle the 402 payment flow.
 */
app.get('/ping/paid', async (c) => {
	const rpcUrl = getRpcUrl(c.env)

	// Create the payment middleware with environment-specific config
	const middleware = paymentAuth({
		method: 'base',
		realm: 'basic_base',
		destination: c.env.DESTINATION_ADDRESS as Address,
		asset: getFeeTokenAddress(c.env),
		amount: getPaymentAmount(c.env),
		challengeValidityMs: getChallengeValidityMs(c.env),
		description: 'Pay 0.01 USD to access the paid ping endpoint',
		verify: verifyErc20Transfer,
		broadcast: (signedTx) => broadcastToBase(signedTx, rpcUrl),
		confirm: (txHash) => confirmOnBase(txHash, rpcUrl),
		explorerUrl: 'https://sepolia.basescan.org/tx/{txHash}',
	})

	// Run the middleware - it will set payment context on success
	let paymentComplete = false
	const result = await middleware(c, async () => {
		paymentComplete = true
	})

	// If middleware returned a response (402, 400, etc.), return it
	if (result) {
		return result
	}

	// If payment wasn't completed, something went wrong
	if (!paymentComplete) {
		return c.json({ error: 'Payment flow incomplete' }, 500)
	}

	// Payment succeeded - return the response
	const payment = c.get('payment')

	return c.json({
		message: 'pong (paid!)',
		paid: true,
		timestamp: new Date().toISOString(),
		receipt: {
			status: payment.receipt.status,
			txHash: payment.txHash,
			blockNumber: payment.blockNumber,
			explorer: `https://sepolia.basescan.org/tx/${payment.txHash}`,
		},
	})
})

export default app
