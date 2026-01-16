import { tempoDevnet, tempoAndantino, tempoModerato } from 'viem/chains'

const tempoRpcKey = process.env.TEMPO_RPC_KEY
if (!tempoRpcKey) throw new Error('TEMPO_RPC_KEY is not set')

const tempoPresto = {
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
			http: [`https://rpc.presto.tempo.xyz/${tempoRpcKey}`],
			webSocket: [`wss://rpc.presto.tempo.xyz/${tempoRpcKey}`],
		},
	},
} as const

export const chains = {
	[tempoDevnet.id]: tempoDevnet,
	[tempoModerato.id]: tempoModerato,
	[tempoAndantino.id]: tempoAndantino,
	[tempoPresto.id]: tempoPresto,
}

export const CHAIN_IDS = [
	tempoDevnet.id,
	tempoModerato.id,
	tempoAndantino.id,
	tempoPresto.id,
] as const
// matches https://sourcify.dev/server/chains format
export const sourcifyChains = [
	tempoDevnet,
	tempoModerato,
	tempoAndantino,
	tempoPresto,
].map((chain) => {
	const returnValue = {
		name: chain.name,
		title: chain.name,
		chainId: chain.id,
		rpc: [chain.rpcUrls.default.http, chain.rpcUrls.default.webSocket].flat(),
		supported: true,
		etherscanAPI: false,
		_extra: {},
	}

	if (chain?.blockExplorers)
		returnValue._extra = {
			blockExplorer: chain?.blockExplorers.default,
		}

	return returnValue
})
