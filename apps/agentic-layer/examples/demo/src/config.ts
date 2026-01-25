import { TESTNET_RPC, ALPHA_USD_ADDRESS } from '../../../packages/common/src'
import 'dotenv/config'

/**
 * Shared configuration for Tempo Agentic Layer demos.
 * Centralizes environment variable management and default values.
 */
export const config = {
	// Basic Server Config
	port: Number(process.env.PORT) || 3000,
	serverUrl: process.env.SERVER_URL || 'http://localhost:3000',

	// Blockchain Config
	rpcUrl: process.env.TEMPO_RPC || TESTNET_RPC,

	// Settlement Config
	recipient: process.env.SERVER_WALLET || '0xRecipientAddress',
	token: process.env.USDC_ADDRESS || ALPHA_USD_ADDRESS,
	amount: '100000', // 0.10 USD (assuming 6 decimals)

	// Client Config
	clientPrivateKey: process.env.CLIENT_PRIVATE_KEY || `0x${'1'.repeat(64)}`,

	// Logging Level
	logLevel:
		(process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
} as const
