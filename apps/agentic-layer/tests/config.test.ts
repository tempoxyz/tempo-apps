import { describe, it, expect, beforeEach } from 'vitest'
import {
	loadConfigFromEnv,
	ENV_VARS,
	TESTNET_RPC,
	PaymentConfigError,
} from '@tempo/402-common'

describe('Config Loader Tests', () => {
	const RECIPIENT = '0x1234567890123456789012345678901234567890'
	const AMOUNT = '1000'
	const TOKEN = '0x0987654321098765432109876543210987654321'
	const RPC_URL = 'https://custom-rpc.com'
	const AGE = '600'

	beforeEach(() => {
		// Clear relevant environment variables before each test
		process.env[ENV_VARS.RECIPIENT] = ''
		process.env[ENV_VARS.AMOUNT] = ''
		process.env[ENV_VARS.TOKEN] = ''
		process.env[ENV_VARS.RPC_URL] = ''
		process.env[ENV_VARS.ALLOWED_AGE_SECONDS] = ''
	})

	it('should load configuration from environment variables', () => {
		process.env[ENV_VARS.RECIPIENT] = RECIPIENT
		process.env[ENV_VARS.AMOUNT] = AMOUNT
		process.env[ENV_VARS.TOKEN] = TOKEN
		process.env[ENV_VARS.RPC_URL] = RPC_URL
		process.env[ENV_VARS.ALLOWED_AGE_SECONDS] = AGE

		const config = loadConfigFromEnv()

		expect(config.recipient).toBe(RECIPIENT)
		expect(config.amount).toBe(AMOUNT)
		expect(config.token).toBe(TOKEN)
		expect(config.rpcUrl).toBe(RPC_URL)
		expect(config.allowedAgeSeconds).toBe(600)
	})

	it('should use default RPC URL when not specified', () => {
		const config = loadConfigFromEnv()
		expect(config.rpcUrl).toBe(TESTNET_RPC)
	})

	it('should throw PaymentConfigError for invalid recipient address', () => {
		process.env[ENV_VARS.RECIPIENT] = 'invalid-address'
		expect(() => loadConfigFromEnv()).toThrow(PaymentConfigError)
	})

	it('should throw PaymentConfigError for negative amount', () => {
		process.env[ENV_VARS.AMOUNT] = '-1'
		expect(() => loadConfigFromEnv()).toThrow(PaymentConfigError)
	})

	it('should handle missing environment variables gracefully (non-throwing if empty)', () => {
		const config = loadConfigFromEnv()
		expect(config.recipient).toBeUndefined()
		expect(config.amount).toBeUndefined()
	})

	it('should handle invalid ALLOWED_AGE_SECONDS by ignoring it', () => {
		process.env[ENV_VARS.ALLOWED_AGE_SECONDS] = 'invalid'
		const config = loadConfigFromEnv()
		expect(config.allowedAgeSeconds).toBeUndefined()
	})

	it('should ignore ALLOWED_AGE_SECONDS <= 1', () => {
		process.env[ENV_VARS.ALLOWED_AGE_SECONDS] = '1'
		const config = loadConfigFromEnv()
		expect(config.allowedAgeSeconds).toBeUndefined()
	})
})
