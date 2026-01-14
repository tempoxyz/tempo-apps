import { tempoModerato } from 'viem/chains'

const RPC_PROXY_HOSTNAME = 'proxy.tempo.xyz'

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
			http: [`https://${RPC_PROXY_HOSTNAME}/rpc/4217`],
			webSocket: [`wss://${RPC_PROXY_HOSTNAME}/rpc/4217`],
		},
	},
} as const
