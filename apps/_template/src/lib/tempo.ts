import { env } from 'cloudflare:workers'
import { createPublicClient, http } from 'viem'
import { tempoModerato, tempoTestnet } from 'tempo.ts/chains'
import { publicActionsL2 } from 'tempo.ts'

/**
 * Get Tempo chain config based on environment
 */
export function getTempoChain() {
	switch (env.TEMPO_ENV) {
		case 'testnet':
			return tempoTestnet
		case 'moderato':
		default:
			return tempoModerato
	}
}

/**
 * Create a Tempo public client for reading chain data
 */
export function getTempoClient() {
	const chain = getTempoChain()

	return createPublicClient({
		chain,
		transport: http(env.TEMPO_RPC_URL ?? chain.rpcUrls.default.http[0]),
	}).extend(publicActionsL2())
}

/**
 * TIP-20 token addresses on Tempo
 */
export const tokens = {
	alphaUSD: '0x20c0000000000000000000000000000000000001' as const,
	USDC: '0x20c0000000000000000000000000000000000002' as const,
	USDT: '0x20c0000000000000000000000000000000000003' as const,
	pathUSD: '0x20c0000000000000000000000000000000000000' as const,
} as const

/**
 * Tempo system precompile addresses
 */
export const precompiles = {
	feeManager: '0xfeec000000000000000000000000000000000000' as const,
	stablecoinDex: '0x20c0000000000000000000000000000000000000' as const,
} as const
