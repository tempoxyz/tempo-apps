import { tempoDevnet, tempoModerato, tempoAndantino } from 'viem/chains'

export const CHAIN_IDS = [
	tempoDevnet.id,
	tempoAndantino.id,
	tempoModerato.id,
] as const

export const chains = {
	[tempoDevnet.id]: tempoDevnet,
	[tempoModerato.id]: tempoModerato,
	[tempoAndantino.id]: tempoAndantino,
}
