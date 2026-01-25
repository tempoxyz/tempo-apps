import { type Logger, SilentLogger } from '../index'
import {
	createPublicClient,
	http,
	decodeEventLog,
	parseAbi,
	type PublicClient,
} from 'viem'

// Configuration defaults for blockchain interaction
const DEFAULT_RPC_RETRY_COUNT = 3
const DEFAULT_RPC_RETRY_DELAY_MS = 1000

/**
 * Configuration for payment verification on-chain.
 */
export interface VerifyConfig {
	/** Target recipient address */
	recipient: string
	/** Required payment amount */
	amount: string
	/** Token contract address */
	token: string
	/** RPC URL for the blockchain network */
	rpcUrl: string
	/** Optional maximum age for transaction validity in seconds */
	maxAgeSeconds?: number
	/** Number of confirmations required (default: 1) */
	confirmations?: number
	/** Optional logger instance */
	logger?: Logger
}

// Persistent cache for PublicClient instances to avoid redundant initialization
const clientCache = new Map<string, PublicClient>()

// Static ABI definitions for optimized event decoding
const TRANSFER_EVENT_ABI = parseAbi([
	'event Transfer(address indexed from, address indexed to, uint256 value)',
])
const TRANSFER_TOPIC =
	'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/**
 * Helper to get or create a PublicClient for an RPC URL with retry support
 */
function getClient(rpcUrl: string): PublicClient {
	let client = clientCache.get(rpcUrl)
	if (!client) {
		client = createPublicClient({
			transport: http(rpcUrl, {
				retryCount: DEFAULT_RPC_RETRY_COUNT,
				retryDelay: DEFAULT_RPC_RETRY_DELAY_MS,
			}),
		})
		clientCache.set(rpcUrl, client)
	}
	return client
}

/**
 * Validates a transaction hash on-chain against required payment parameters.
 * Core verification logic utilizing Viem for high-performance settlement checks.
 */
export async function verifyPaymentHash(
	txHash: `0x${string}`,
	config: VerifyConfig,
): Promise<boolean> {
	const client = getClient(config.rpcUrl)
	const requiredConfirmations = config.confirmations ?? 1
	const logger = config.logger || new SilentLogger()

	try {
		// 1. Fetch receipt first and verify confirmation depth
		const receipt = await client.getTransactionReceipt({ hash: txHash })

		if (receipt.status !== 'success') {
			return false
		}

		// Verify confirmations
		const currentBlock = await client.getBlockNumber()
		const confirmations = currentBlock - receipt.blockNumber + 1n
		if (confirmations < BigInt(requiredConfirmations)) {
			logger.warn('[Tempo-Verify] Insufficient confirmations', {
				txHash,
				confirmations: Number(confirmations),
				required: requiredConfirmations,
			})
			return false
		}

		// 2. Fetch full transaction to verify intended destination (token contract)
		const tx = await client.getTransaction({ hash: txHash })
		if (tx.to?.toLowerCase() !== config.token.toLowerCase()) {
			return false
		}

		// 3. Verify age if configured
		if (config.maxAgeSeconds) {
			const block = await client.getBlock({ blockNumber: receipt.blockNumber })
			const txTimestamp = Number(block.timestamp)
			const currentTimestamp = Math.floor(Date.now() / 1000)

			if (currentTimestamp - txTimestamp > config.maxAgeSeconds) {
				return false
			}
		}

		// 4. Decode and verify Transfer event (Filtered by topic for efficiency)
		const transferLog = receipt.logs
			.filter((log) => log.topics[0] === TRANSFER_TOPIC)
			.find((log) => {
				try {
					const decoded = decodeEventLog({
						abi: TRANSFER_EVENT_ABI,
						data: log.data,
						topics: log.topics,
					})

					if (decoded.eventName !== 'Transfer') return false

					const { to, value } = decoded.args as { to: string; value: bigint }

					return (
						to.toLowerCase() === config.recipient.toLowerCase() &&
						value >= BigInt(config.amount)
					)
				} catch {
					return false
				}
			})

		return !!transferLog
	} catch (error) {
		// Emit detailed error context for diagnostic purposes
		logger.error('[Tempo-Verify] Verification failed', {
			txHash,
			error: error instanceof Error ? error.message : String(error),
			config: { ...config, rpcUrl: '[REDACTED]', logger: undefined },
		})
		return false
	}
}
