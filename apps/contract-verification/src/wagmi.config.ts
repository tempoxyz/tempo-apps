import { Address } from 'ox'
import * as z from 'zod/mini'
import {
	cookieStorage,
	createConfig,
	createStorage,
	fallback,
	http,
} from 'wagmi'

import {
	tempoDevnet,
	tempo as tempoPresto,
	tempoModerato as tempoTestnet,
} from '@wagmi/core/chains'

const verifierUrl =
	import.meta.env.VITE_VERIFIER_URL ?? 'https://contracts.tempo.xyz'

export const tempoMainnet = {
	...tempoPresto.extend({
		verifierUrl,
		feeToken: '0x20c0000000000000000000000000000000000000',
	}),
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
			http: [
				`https://proxy.tempo.xyz/rpc/4217?key=${process.env.TEMPO_RPC_KEY}`,
			],
			webSocket: [
				`wss://proxy.tempo.xyz/rpc/4217?key=${process.env.TEMPO_RPC_KEY}`,
			],
		},
	},
} as const

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
	tempoMainnet,
] as const
export const chainFeeTokens = {
	[tempoDevnet.id]: '0x20c0000000000000000000000000000000000000',
	[tempoTestnet.id]: '0x20c0000000000000000000000000000000000001',
	[tempoMainnet.id]: '0x20c0000000000000000000000000000000000002',
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

// Create config as singleton to ensure wagmi/core recognizes chains properly
let wagmiConfigInstance: ReturnType<typeof createConfig> | null = null

export const getWagmiConfig = () => {
	wagmiConfigInstance ??= createConfig({
		chains,
		ssr: true,
		storage: createStorage({ storage: cookieStorage }),
		transports: {
			[tempoDevnet.id]: fallback([
				http(tempoDevnet.rpcUrls.default.http.at(0)),
			]),
			[tempoTestnet.id]: fallback([
				http(tempoTestnet.rpcUrls.default.http.at(0)),
			]),
			[tempoMainnet.id]: fallback([
				http(tempoMainnet.rpcUrls.default.http.at(0)),
			]),
		},
	})
	return wagmiConfigInstance
}

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

declare module 'wagmi' {
	interface Register {
		config: ReturnType<typeof getWagmiConfig>
	}
}
