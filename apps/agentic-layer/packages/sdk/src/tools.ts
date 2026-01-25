import type { SettlementHandler } from './settlement'
import type { PaymentRequirement } from './types'

/**
 * Metadata for the payment settlement tool.
 */
export const SETTLE_PAYMENT_METADATA = {
	name: 'settle_tempo_payment',
	description:
		'Settles a Tempo 402 Payment Required challenge. Call this when you receive a 402 error with payment information.',
	parameters: {
		type: 'object',
		properties: {
			amount: { type: 'string', description: 'Amount in atomic units' },
			recipient: { type: 'string', description: 'Recipient address (0x...)' },
			token: {
				type: 'string',
				description: 'Token address (optional, defaults to ALPHA_USD)',
			},
			chainId: { type: 'number', description: 'Chain ID' },
			rpcUrl: { type: 'string', description: 'RPC URL for verification' },
		},
		required: ['amount', 'recipient', 'rpcUrl'],
	},
}

/**
 * Creates an OpenAI-compatible function definition and execution handler.
 */
export function createOpenAITool(settlement: SettlementHandler) {
	return {
		definition: {
			type: 'function',
			function: SETTLE_PAYMENT_METADATA,
		},
		handler: async (args: any) => {
			const txHash = await settlement.settle(args as PaymentRequirement)
			return {
				txHash,
				status: 'success',
				message: 'Payment settled successfully',
			}
		},
	}
}

/**
 * A generic tool interface that can be easily wrapped for LangChain or other frameworks.
 */
export function createSettlementTool(settlement: SettlementHandler) {
	return {
		name: SETTLE_PAYMENT_METADATA.name,
		description: SETTLE_PAYMENT_METADATA.description,
		schema: SETTLE_PAYMENT_METADATA.parameters,
		func: async (args: any) => {
			return await settlement.settle(args as PaymentRequirement)
		},
	}
}
