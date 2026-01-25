import { TESTNET_RPC } from './index'
import { validateGateConfig } from './validation'

// Environment variable configuration loader
export const ENV_VARS = {
	RECIPIENT: 'TEMPO_RECIPIENT',
	AMOUNT: 'TEMPO_AMOUNT',
	TOKEN: 'TEMPO_TOKEN',
	RPC_URL: 'TEMPO_RPC_URL',
	ALLOWED_AGE_SECONDS: 'TEMPO_ALLOWED_AGE_SECONDS',
} as const

export interface EnvConfig {
	recipient?: string
	amount?: string
	token?: string
	rpcUrl?: string
	allowedAgeSeconds?: number
}

/**
 * Load configuration from environment variables
 * @returns Partial configuration object with values from env vars
 */
export function loadConfigFromEnv(): EnvConfig {
	const config: EnvConfig = {}

	if (process.env[ENV_VARS.RECIPIENT]) {
		config.recipient = process.env[ENV_VARS.RECIPIENT]
	}

	if (process.env[ENV_VARS.AMOUNT]) {
		config.amount = process.env[ENV_VARS.AMOUNT]
	}

	if (process.env[ENV_VARS.TOKEN]) {
		config.token = process.env[ENV_VARS.TOKEN]
	}

	if (process.env[ENV_VARS.RPC_URL]) {
		config.rpcUrl = process.env[ENV_VARS.RPC_URL]
	} else {
		config.rpcUrl = TESTNET_RPC // Default to testnet
	}

	if (process.env[ENV_VARS.ALLOWED_AGE_SECONDS]) {
		const parsed = parseInt(process.env[ENV_VARS.ALLOWED_AGE_SECONDS]!, 10)
		if (!Number.isNaN(parsed) && parsed > 1) {
			config.allowedAgeSeconds = parsed
		}
	}

	// Basic validation of what was loaded
	validateGateConfig(config)

	return config
}
