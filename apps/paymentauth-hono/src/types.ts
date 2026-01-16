import type { ChargeRequest, PaymentReceipt } from 'paymentauth-protocol'
import type { Address, Hex } from 'viem'

/**
 * Result of verifying a signed transaction.
 */
export interface VerificationResult {
	valid: boolean
	error?: string
	from?: Address
}

/**
 * Function to verify a signed transaction against a payment request.
 */
export type PaymentVerifier = (
	signedTx: Hex,
	request: ChargeRequest,
) => Promise<VerificationResult>

/**
 * Result of broadcasting a transaction.
 */
export interface BroadcastResult {
	success: boolean
	transactionHash?: Hex
	error?: string
}

/**
 * Function to broadcast a signed transaction.
 */
export type TransactionBroadcaster = (signedTx: Hex) => Promise<BroadcastResult>

/**
 * Function to wait for transaction confirmation and get block number.
 */
export type TransactionConfirmer = (
	txHash: Hex,
) => Promise<{ blockNumber: bigint | null }>

/**
 * Configuration for the payment auth middleware.
 */
export interface PaymentAuthConfig {
	/** Payment method identifier (e.g., "tempo", "base") */
	method: string
	/** Realm for the payment challenge */
	realm: string
	/** Destination address for payments */
	destination: Address
	/** Token/asset address */
	asset: Address
	/** Payment amount in base units */
	amount: string
	/** Challenge validity in milliseconds (default: 300000 = 5 minutes) */
	challengeValidityMs?: number
	/** Human-readable description for the payment */
	description?: string
	/** Function to verify signed transactions */
	verify: PaymentVerifier
	/** Function to broadcast transactions */
	broadcast: TransactionBroadcaster
	/** Optional function to wait for confirmation */
	confirm?: TransactionConfirmer
	/** Block explorer URL template (use {txHash} as placeholder) */
	explorerUrl?: string
}

/**
 * Context added to the Hono request after successful payment.
 */
export interface PaymentAuthContext {
	/** Whether payment was made */
	paid: boolean
	/** Payment receipt */
	receipt: PaymentReceipt & { blockNumber?: string }
	/** Transaction hash */
	txHash: Hex
	/** Block number (if confirmed) */
	blockNumber: string | null
	/** Payer address */
	payer?: Address
}
