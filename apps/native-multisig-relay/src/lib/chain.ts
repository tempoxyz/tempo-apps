import { env } from 'cloudflare:workers'
import { tempo, tempoDevnet, tempoLocalnet, tempoModerato } from 'viem/chains'
import type { Chain } from 'viem/chains'

type CanonicalTempoEnv = 'devnet' | 'localnet' | 'mainnet' | 'moderato'
type TempoEnv = CanonicalTempoEnv | 'testnet'

const chains = {
	devnet: tempoDevnet,
	localnet: tempoLocalnet,
	mainnet: tempo,
	moderato: tempoModerato,
} as const satisfies Record<CanonicalTempoEnv, Chain>

const feeTokens = {
	devnet: '0x20c0000000000000000000000000000000000001',
	localnet: '0x20c0000000000000000000000000000000000000',
	mainnet: '0x50570a1a3a6e67f87d67737d2e2cc7bd5edb1c9d',
	moderato: '0x20c0000000000000000000000000000000000001',
} as const satisfies Record<CanonicalTempoEnv, `0x${string}`>

export const tempoTokens = [
	{
		address: '0x20c0000000000000000000000000000000000000',
		decimals: 6,
		name: 'pathUSD',
		symbol: 'pathUSD',
	},
	{
		address: '0x20c0000000000000000000000000000000000001',
		decimals: 6,
		name: 'alphaUSD',
		symbol: 'alphaUSD',
	},
	{
		address: '0x20c0000000000000000000000000000000000002',
		decimals: 6,
		name: 'betaUSD',
		symbol: 'betaUSD',
	},
	{
		address: '0x20c0000000000000000000000000000000000003',
		decimals: 6,
		name: 'thetaUSD',
		symbol: 'thetaUSD',
	},
] as const

const rawTempoEnv = (env.TEMPO_ENV as TempoEnv | undefined) ?? 'moderato'
const tempoEnv: CanonicalTempoEnv =
	rawTempoEnv === 'testnet' ? 'moderato' : rawTempoEnv

export const tempoFeeToken = feeTokens[tempoEnv]

export const tempoChain = chains[tempoEnv].extend({
	feeToken: tempoFeeToken,
})
