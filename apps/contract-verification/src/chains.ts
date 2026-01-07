import { tempoDevnet, tempoAndantino, tempoModerato } from 'viem/chains'

export const chains = {
	[tempoDevnet.id]: tempoDevnet,
	[tempoModerato.id]: tempoModerato,
	[tempoAndantino.id]: tempoAndantino,
}

export const CHAIN_IDS = [
	tempoDevnet.id,
	tempoModerato.id,
	tempoAndantino.id,
] as const
// matches https://sourcify.dev/server/chains format
export const sourcifyChains = [tempoDevnet, tempoModerato, tempoAndantino].map(
	(chain) => {
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
	},
)
