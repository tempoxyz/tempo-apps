import { Address } from 'ox'
import * as z from 'zod/mini'
import {
	tempoDevnet,
	tempo as tempoMainnet,
	tempoModerato as tempoTestnet,
} from '@wagmi/core/chains'

const verifierUrl =
	import.meta.env.VITE_VERIFIER_URL ?? 'https://contracts.tempo.xyz'

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

export const zAddress = (opts?: { lowercase?: boolean }) =>
	z.pipe(
		z.string(),
		z.transform((x) => {
			if (opts?.lowercase) x = x.toLowerCase()
			Address.assert(x)
			return x
		}),
	)

export const zChainId = () =>
	z.pipe(
		z.string(),
		z.transform((x) => {
			const n = Number.parseInt(x, 10)
			if (Number.isNaN(n)) throw new Error('Invalid chain ID')
			return n
		}),
	)
