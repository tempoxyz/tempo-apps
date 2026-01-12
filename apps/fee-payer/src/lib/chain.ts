import { env } from 'cloudflare:workers'
import {
	tempoDevnet,
	tempoLocalnet,
	tempoModerato,
	tempoTestnet,
} from 'viem/chains'
import { alphaUsd } from './consts.js'

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

const chains = {
	devnet: tempoDevnet,
	localnet: tempoLocalnet,
	moderato: tempoModerato,
	testnet: tempoTestnet,
	presto: tempoPresto,
}

type TempoEnv = keyof typeof chains

export const tempoChain = (
	chains[env.TEMPO_ENV as TempoEnv] ?? tempoTestnet
).extend({ feeToken: alphaUsd })
