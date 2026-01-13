// TODO: Import from @x402/core/types once types are resolved
export interface PaymentPayload {
	x402Version: 2
	resource: {
		url: string
		description: string
		mimeType: string
	}
	accepted: PaymentRequirements
	payload: {
		signedTransaction: `0x${string}`
	}
}

export interface PaymentRequirements {
	scheme: 'exact'
	network: string
	amount: string
	asset: `0x${string}`
	payTo: `0x${string}`
	maxTimeoutSeconds: number
	extra?: {
		name?: string
		decimals?: number
	}
}

export interface VerifyResponse {
	success: boolean
	error?: {
		code: string
		message: string
	}
}

export interface SettlementResponse {
	success: boolean
	transactionHash?: `0x${string}`
	network: string
	error?: {
		code: string
		message: string
	}
}
