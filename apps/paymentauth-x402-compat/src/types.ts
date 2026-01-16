import type { Address, Hex } from 'viem'

/**
 * x402 payment requirements returned in 402 response body
 * @see https://github.com/coinbase/x402
 */
export interface X402PaymentRequirements {
	/** Scheme identifier (always "exact" for now) */
	scheme: 'exact'
	/** Network identifier (e.g., "base-sepolia", "base") */
	network: string
	/** Maximum amount willing to pay (in base units, string format) */
	maxAmountRequired: string
	/** Payment resource endpoint (usually same as request URL) */
	resource: string
	/** Additional payment details */
	extra?: {
		/** Human-readable description */
		name?: string
		description?: string
	}
	/** Asset type (e.g., "USDC") - derived from contract address */
	asset?: string
	/** Payment recipient address */
	payTo: Address
}

/**
 * x402 payment payload sent in X-PAYMENT header
 */
export interface X402PaymentPayload {
	/** The x402 payload version */
	x402Version: number
	/** Scheme identifier */
	scheme: 'exact'
	/** Network identifier */
	network: string
	/** Payment payload */
	payload: {
		/** Transaction signature (signed transaction hex) */
		signature: Hex
		/** Authorization details */
		authorization?: {
			/** Sender address */
			from: Address
			/** Recipient address */
			to: Address
			/** Amount in base units */
			value: string
			/** Validity start */
			validAfter: string
			/** Validity end */
			validBefore: string
			/** Nonce */
			nonce: Hex
		}
	}
}

/**
 * x402 payment receipt returned in X-PAYMENT-RESPONSE header
 */
export interface X402PaymentReceipt {
	/** Whether the payment was successful */
	success: boolean
	/** Transaction hash if successful */
	transactionHash?: Hex
	/** Error message if failed */
	error?: string
	/** Network the transaction was on */
	network?: string
}
