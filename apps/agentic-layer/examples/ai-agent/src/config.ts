import { TESTNET_RPC, ALPHA_USD_ADDRESS } from '@tempo/402-common'
import 'dotenv/config'

export const config = {
	port: Number(process.env.PORT) || 3001,
	serverUrl: process.env.SERVER_URL || 'http://localhost:3001',
	rpcUrl: process.env.TEMPO_RPC_URL || TESTNET_RPC,
	recipient: process.env.TEMPO_RECIPIENT || '0xRecipientAddress',
	token: process.env.TEMPO_TOKEN || ALPHA_USD_ADDRESS,
	amount: process.env.TEMPO_AMOUNT || '1000000', // 1.00 USD
	agentPrivateKey: process.env.CLIENT_PRIVATE_KEY || `0x${'1'.repeat(64)}`,
} as const
