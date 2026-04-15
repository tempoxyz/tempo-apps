import { tempoDevnet, tempoMainnet, tempoTestnet } from '@wagmi/core/chains'

const verifierUrl =
	import.meta.env?.VITE_VERIFIER_URL ?? 'https://contracts.tempo.xyz'

export const tempoMainnetExtended = tempoMainnet.extend({
	verifierUrl,
	feeToken: '0x20c0000000000000000000000000000000000000',
})

export const tempoDevnetExtended = tempoDevnet.extend({
	verifierUrl,
	feeToken: '0x20c0000000000000000000000000000000000000',
})

export const tempoTestnetExtended = tempoTestnet.extend({
	verifierUrl,
	feeToken: '0x20c0000000000000000000000000000000000001',
})

export const chainIds = [
	tempoDevnet.id,
	tempoTestnet.id,
	tempoMainnet.id,
] as const
export type ChainId = (typeof chainIds)[number]
export const chains = [
	tempoDevnetExtended,
	tempoTestnetExtended,
	tempoMainnetExtended,
] as const
export const chainFeeTokens = {
	[tempoDevnet.id]: tempoDevnetExtended.feeToken,
	[tempoTestnet.id]: tempoTestnetExtended.feeToken,
	[tempoMainnet.id]: tempoMainnetExtended.feeToken,
} as const

export const sourcifyChains = chains.map((chain) => {
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
		returnValue._extra = { blockExplorer: chain?.blockExplorers.default }
	return returnValue
})
