import {
	encodeFunctionData,
	parseAbi,
	type Chain,
	type Hex,
	type PublicClient,
	type WalletClient,
} from 'viem'
import type { PrivateKeyAccount } from 'viem/accounts'
import {
	ALPHA_USD_ADDRESS,
	ERC20_ABI,
	SilentLogger,
	type Logger,
	TESTNET_ID,
	TESTNET_RPC,
} from '@tempo/402-common'
import { defineChain } from 'viem'
import type { PaymentRequirement } from './types'

const tempoModerato = defineChain({
	id: TESTNET_ID,
	name: 'Tempo Moderato',
	nativeCurrency: { name: 'pathUSD', symbol: 'pathUSD', decimals: 18 },
	rpcUrls: {
		default: { http: [TESTNET_RPC] },
	},
})

/**
 * Handles the financial settlement of a 402 challenge.
 * Framework-agnostic and can be used with any HTTP client.
 */
export class SettlementHandler {
	private readonly publicClient: PublicClient
	private readonly walletClient: WalletClient
	private readonly account?: PrivateKeyAccount
	private readonly logger: Logger
	private readonly feeToken: Hex
	private readonly txTimeout: number

	constructor(config: {
		publicClient: PublicClient
		walletClient: WalletClient
		account?: PrivateKeyAccount
		logger?: Logger
		feeToken?: Hex
		txTimeout?: number
	}) {
		this.publicClient = config.publicClient
		this.walletClient = config.walletClient
		this.account = config.account
		this.logger = config.logger || new SilentLogger()
		this.feeToken = config.feeToken || (ALPHA_USD_ADDRESS as Hex)
		this.txTimeout = config.txTimeout || 60000
	}

	/**
	 * Executes the payment transaction and waits for confirmation.
	 * @returns The transaction hash to be used in the Authorization header.
	 */
	public async settle(info: PaymentRequirement): Promise<string> {
		this.logger.info('Executing settlement', {
			amount: info.amount,
			recipient: info.recipient,
			token: info.token,
		})

		try {
			const txHash = await this.walletClient.sendTransaction({
				chain: (this.walletClient.chain || tempoModerato) as Chain,
				account: (this.walletClient.account ||
					this.account) as PrivateKeyAccount,
				to: (info.token || this.feeToken) as Hex,
				data: encodeFunctionData({
					abi: parseAbi([...ERC20_ABI]),
					functionName: 'transfer',
					args: [info.recipient as Hex, BigInt(info.amount)],
				}),
			})

			this.logger.info('Settlement broadcast successful', { txHash })

			const receipt = await this.publicClient.waitForTransactionReceipt({
				hash: txHash,
				timeout: this.txTimeout,
				confirmations: 1,
			})

			if (receipt.status !== 'success') {
				throw new Error(`Transaction reverted: ${txHash}`)
			}

			this.logger.info('Settlement confirmed', {
				txHash,
				blockNumber: receipt.blockNumber,
			})
			return txHash
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error))
			this.logger.error('Settlement failed', { error: err.message })
			throw err
		}
	}
}
