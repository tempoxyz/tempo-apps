import { tempoModerato } from 'viem/chains'
import { defineChain } from 'viem'

const RPC_PROXY_HOSTNAME = 'proxy.tempo.xyz'

export const tempoPresto = defineChain({
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
})
