import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import type { PublicClient, WalletClient, Hex, Chain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { PrivateKeyAccount } from 'viem/accounts'
import {
	ALPHA_USD_ADDRESS,
	TESTNET_RPC,
	TESTNET_ID,
	DEFAULT_TIMEOUT_MS,
	SilentLogger,
} from '@tempo/402-common'
import type { Logger } from '@tempo/402-common'
import { SettlementHandler } from './settlement'

/**
 * Tempo Moderato testnet chain definition
 */
const tempoModerato = defineChain({
	id: TESTNET_ID,
	name: 'Tempo Moderato',
	nativeCurrency: { name: 'pathUSD', symbol: 'pathUSD', decimals: 18 },
	rpcUrls: {
		default: { http: [TESTNET_RPC] },
	},
})
import type { PaymentRequirement, TempoAgentConfig } from './types'

/**
 * Custom error class for payment-related failures.
 * Preserves original error context for debugging.
 */
export class PaymentFailureError extends Error {
	public readonly originalError?: Error

	constructor(message: string, originalError?: Error) {
		super(message)
		this.name = 'PaymentFailureError'
		this.originalError = originalError

		if (originalError?.stack) {
			this.stack = `${this.stack}\nCaused by: ${originalError.stack}`
		}
	}
}

/**
 * Validates a hex private key format.
 */
function isValidPrivateKey(key: string): key is Hex {
	return /^0x[a-fA-F0-9]{64}$/.test(key)
}

/**
 * Validates a URL format.
 */
function isValidUrl(url: string): boolean {
	try {
		new URL(url)
		return true
	} catch {
		return false
	}
}

/**
 * Validates an Ethereum address format.
 */
function isValidAddress(address: string): boolean {
	return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Standardized 402 Settlement Agent.
 * Executes HTTP 402 financial settlement workflows for autonomous AI agents.
 *
 * @example
 * ```typescript
 * const agent = new Agent({
 *     privateKey: process.env.PRIVATE_KEY as Hex,
 *     rpcUrl: 'https://rpc.moderato.tempo.xyz'
 * });
 *
 * const response = await agent.request({ url: 'https://api.premium.service/data' });
 * ```
 */
export class Agent {
	private readonly client: AxiosInstance
	private readonly settlement: SettlementHandler
	private readonly logger: Logger

	/**
	 * Creates a new Agent instance.
	 *
	 * @param config - Agent configuration
	 * @throws Error if privateKey is missing or invalid
	 * @throws Error if rpcUrl format is invalid
	 * @throws Error if feeToken address is invalid
	 */
	constructor(config: TempoAgentConfig) {
		// Validate configuration: at least a privateKey OR a walletClient must be provided
		if (!config.privateKey && !config.walletClient) {
			throw new Error('Either privateKey or walletClient is required')
		}

		if (config.privateKey && !isValidPrivateKey(config.privateKey)) {
			throw new Error(
				'Invalid privateKey format: must be 0x followed by 64 hex characters',
			)
		}

		// Validate rpcUrl if provided
		const rpcUrl = config.rpcUrl || TESTNET_RPC
		if (config.rpcUrl && !isValidUrl(config.rpcUrl)) {
			throw new Error('Invalid rpcUrl format: must be a valid URL')
		}

		// Validate feeToken if provided
		if (config.feeToken && !isValidAddress(config.feeToken)) {
			throw new Error(
				'Invalid feeToken address: must be 0x followed by 40 hex characters',
			)
		}

		this.logger = config.logger || new SilentLogger()
		const feeToken = (config.feeToken as Hex) || ALPHA_USD_ADDRESS
		const txTimeout = config.txTimeout || 60000

		// Explicitly cast to tempoModerato to ensure chain compatibility
		const chain = (config.walletClient?.chain || tempoModerato) as Chain

		const publicClient = (config.publicClient ||
			createPublicClient({
				chain: chain,
				transport: http(rpcUrl),
			})) as PublicClient

		let walletClient: WalletClient
		let account: PrivateKeyAccount | undefined

		if (config.walletClient) {
			walletClient = config.walletClient
		} else if (config.privateKey) {
			account = privateKeyToAccount(config.privateKey as Hex)
			walletClient = createWalletClient({
				chain: chain,
				account: account,
				transport: http(rpcUrl),
			}) as WalletClient
		} else {
			// Should be unreachable due to validation above
			throw new Error('Failed to initialize wallet client')
		}

		this.settlement = new SettlementHandler({
			publicClient,
			walletClient,
			account,
			logger: this.logger,
			feeToken,
			txTimeout,
		})

		this.client = axios.create({
			timeout: config.timeout || DEFAULT_TIMEOUT_MS,
			validateStatus: (status) => status < 500,
		})

		this.logger.debug('Agent initialized', {
			rpcUrl,
			mode: config.walletClient ? 'External Wallet' : 'Private Key',
		})
	}

	/**
	 * Performs an HTTP request, automatically handling 402 Payment Required responses.
	 *
	 * @param config - Axios request configuration
	 * @returns Promise resolving to the response
	 * @throws PaymentFailureError if payment settlement fails
	 */
	public async request<T = unknown>(
		config: AxiosRequestConfig,
	): Promise<AxiosResponse<T>> {
		const response = await this.client.request<T>(config)

		if (response.status === 402) {
			const paymentInfo = (
				response.data as { paymentInfo?: PaymentRequirement }
			)?.paymentInfo
			if (!paymentInfo) {
				throw new PaymentFailureError(
					'Received 402 response but no paymentInfo found',
				)
			}
			return this.handle402<T>(config, paymentInfo)
		}

		return response
	}

	/**
	 * Handles 402 Payment Required response by executing payment and retrying.
	 */
	private async handle402<T>(
		config: AxiosRequestConfig,
		info: PaymentRequirement,
	): Promise<AxiosResponse<T>> {
		try {
			const txHash = await this.settlement.settle(info)

			// Retry with authorization header
			return this.client.request<T>({
				...config,
				headers: {
					...config.headers,
					Authorization: `Tempo ${txHash}`,
				},
			})
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error))
			throw new PaymentFailureError(
				`Failed to execute payment transaction: ${err.message}`,
				err,
			)
		}
	}
}

// Re-export for backward compatibility with tests
export { Agent as TempoAgent }
