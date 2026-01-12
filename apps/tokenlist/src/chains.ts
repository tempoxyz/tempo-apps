import { tempoDevnet, tempoModerato, tempoAndantino } from 'viem/chains'

const tempoPresto = {
	...tempoModerato,
	id: 4217,
	name: 'Tempo Mainnet',
	blockExplorers: {
		default: { name: 'Tempo Explorer', url: 'https://explore.tempo.xyz' },
	},
	rpcUrls: {
		default: {
			http: ['https://rpc.presto.tempo.xyz'],
			webSocket: ['wss://rpc.presto.tempo.xyz'],
		},
	},
} as const

export const CHAIN_IDS = [
	tempoDevnet.id,
	tempoAndantino.id,
	tempoModerato.id,
	tempoPresto.id,
] as const

export const chains = {
	[tempoDevnet.id]: tempoDevnet,
	[tempoModerato.id]: tempoModerato,
	[tempoAndantino.id]: tempoAndantino,
	[tempoPresto.id]: tempoPresto,
}
