import { z } from 'zod'
import { PaymentConfigError } from './errors'

/**
 * Ethereum/EVM address schema.
 */
export const addressSchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')

/**
 * Transaction hash schema.
 */
export const txHashSchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash format')

/**
 * Hex private key schema.
 */
export const privateKeySchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid private key format')

/**
 * Payment gate configuration schema.
 */
export const paymentGateConfigSchema = z.object({
	recipient: addressSchema.optional(),
	amount: z
		.string()
		.refine((val: string) => {
			try {
				return BigInt(val) > 0n
			} catch {
				return false
			}
		}, 'Amount must be a positive number')
		.optional(),
	token: addressSchema.optional(),
	rpcUrl: z.string().url('Invalid RPC URL format').optional(),
	allowedAgeSeconds: z.number().int().positive().optional(),
})

/**
 * Validates an Ethereum/EVM address format.
 */
export function isValidAddress(address: string): boolean {
	return addressSchema.safeParse(address).success
}

/**
 * Validates a transaction hash format.
 */
export function isValidTxHash(txHash: string): boolean {
	return txHashSchema.safeParse(txHash).success
}

/**
 * Validates a hex private key format.
 */
export function isValidPrivateKey(key: string): boolean {
	return privateKeySchema.safeParse(key).success
}

/**
 * Validates a URL format.
 */
export function isValidUrl(url: string): boolean {
	try {
		new URL(url)
		return true
	} catch {
		return false
	}
}

import type { CommonGateConfig } from './types'

/**
 * Base configuration interface for payment gates.
 */
export interface PaymentGateConfig extends CommonGateConfig {}

/**
 * Shared validation logic for payment gate configurations.
 */
export function validateGateConfig(config: PaymentGateConfig) {
	const result = paymentGateConfigSchema.safeParse(config)
	if (!result.success) {
		throw new PaymentConfigError('Invalid configuration', {
			details: result.error.issues,
		})
	}
}

/**
 * Redacts sensitive fields from a configuration object for safe logging.
 */
export function redactConfig(config: any): any {
	const redacted = { ...config }
	if (redacted.privateKey) redacted.redactedPrivateKey = '[REDACTED]'
	if (redacted.agentPrivateKey) redacted.redactedAgentPrivateKey = '[REDACTED]'
	// Original keys are often used in existing logic, so we keep them redacted if needed
	delete redacted.privateKey
	delete redacted.agentPrivateKey
	return redacted
}
