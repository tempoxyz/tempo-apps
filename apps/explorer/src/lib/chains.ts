import { tempoModerato } from 'viem/chains'

export const tempoTestnet = {
	...tempoModerato,
	name: 'Tempo Testnet',
} as const

export const tempoMainnet = {
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
