import { tempoDevnet, tempoTestnet } from 'viem/chains'

export const DEVNET_CHAIN_ID = tempoDevnet.id
export const TESTNET_CHAIN_ID = tempoTestnet.id

export const chains = {
	[tempoDevnet.id]: tempoDevnet,
	[tempoTestnet.id]: tempoTestnet,
}

// matches https://sourcify.dev/server/chains format
export const sourcifyChains = [tempoDevnet, tempoTestnet].map((chain) => {
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
