import { tempoModerato } from 'viem/chains'
import type { Chain } from 'viem'

export type Environment = 'local' | 'moderato' | 'mainnet'

export const tempoPresto = {
	...tempoModerato,
	id: 4217,
	name: 'Tempo Mainnet',
	blockExplorers: {
		default: {
			name: 'Tempo Explorer',
			url: 'https://explore.mainnet.tempo.xyz',
		},
	},
	rpcUrls: {
		default: {
			http: ['https://rpc.presto.tempo.xyz'],
			webSocket: ['wss://rpc.presto.tempo.xyz'],
		},
	},
} as const satisfies Chain

export function getChainForEnvironment(environment: Environment): Chain {
	switch (environment) {
		case 'mainnet':
			return tempoPresto
		case 'moderato':
		case 'local':
			return tempoModerato
	}
}
