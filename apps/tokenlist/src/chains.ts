import { tempoDevnet, tempoModerato, tempoTestnet } from 'viem/chains'

export const CHAIN_IDS = [
	tempoDevnet.id,
	tempoTestnet.id,
	tempoModerato.id,
] as const

export const chains = {
	[tempoDevnet.id]: tempoDevnet,
	[tempoTestnet.id]: tempoTestnet,
	[tempoModerato.id]: tempoModerato,
}
