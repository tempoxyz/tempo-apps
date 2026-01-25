import type { PublicClient, WalletClient } from 'viem'
import type { PaymentInfo as PaymentRequirement } from '@tempo/402-common'

export type { PaymentRequirement }

export interface PaymentError {
	error: string
	paymentInfo: PaymentRequirement
	agentHint?: {
		recommendedFeeToken?: string
		memo?: string
	}
}

export interface TempoAgentConfig {
	privateKey?: string
	walletClient?: WalletClient
	publicClient?: PublicClient
	rpcUrl?: string
	feeToken?: string // Address of token to use for gas (defaults to pathUSD)
	timeout?: number // Request timeout in milliseconds (default: 30000)
	txTimeout?: number // Transaction confirmation timeout in milliseconds (default: 60000)
	logger?: import('@tempo/402-common').Logger // Custom logger implementation
}
