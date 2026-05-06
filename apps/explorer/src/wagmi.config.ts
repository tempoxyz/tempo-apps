import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { createPublicClient } from 'viem'
import { tempoDevnet, tempoLocalnet } from 'viem/chains'
import { tempoActions } from 'viem/tempo'
import { loadBalance, rateLimit } from '@tempo/rpc-utils'
import { tempoMainnet, tempoTestnet } from './lib/chains'
import { getTempoEnv } from './lib/env'
import { serverEnv } from './lib/server/env'
import {
	cookieStorage,
	cookieToInitialState,
	createConfig,
	createStorage,
	http,
	serialize,
} from 'wagmi'
import { tempoWallet } from 'wagmi/connectors'

export type WagmiConfig = ReturnType<typeof getWagmiConfig>
let wagmiConfigSingleton: ReturnType<typeof createConfig> | null = null

export const getTempoChain = createIsomorphicFn()
	.client(() =>
		getTempoEnv() === 'mainnet'
			? tempoMainnet
			: getTempoEnv() === 'devnet'
				? tempoDevnet
				: getTempoEnv() === 'testnet'
					? tempoTestnet
					: tempoMainnet,
	)
	.server(() =>
		getTempoEnv() === 'mainnet'
			? tempoMainnet
			: getTempoEnv() === 'devnet'
				? tempoDevnet
				: getTempoEnv() === 'testnet'
					? tempoTestnet
					: tempoMainnet,
	)

const RPC_PROXY_HOSTNAME = 'proxy.tempo.xyz'

const getRpcProxyUrl = createIsomorphicFn()
	.client(() => {
		const chain = getTempoChain()
		return {
			http: `https://${RPC_PROXY_HOSTNAME}/rpc/${chain.id}`,
		}
	})
	.server(() => {
		const chain = getTempoChain()
		const key = serverEnv.TEMPO_RPC_KEY
		const keyParam = key ? `?key=${key}` : ''
		return {
			http: `https://${RPC_PROXY_HOSTNAME}/rpc/${chain.id}${keyParam}`,
		}
	})

const getFallbackUrls = createIsomorphicFn()
	.client(() => ({
		// Browser requests must never hit direct RPC fallbacks.
		http: [] as string[],
	}))
	.server(() => {
		const chain = getTempoChain()
		const key = serverEnv.TEMPO_RPC_KEY
		return {
			http: chain.rpcUrls.default.http.map((url) =>
				key ? `${url}/${key}` : url,
			),
		}
	})

const getTempoTransport = createIsomorphicFn()
	.client(() => {
		const proxy = getRpcProxyUrl()

		// Browser traffic should only hit the RPC proxy. Direct chain RPC endpoints
		// may require credentials that are only available server-side.
		return loadBalance([
			rateLimit(http(proxy.http), {
				requestsPerSecond: 20,
			}),
		])
	})
	.server(() => {
		const proxy = getRpcProxyUrl()
		const fallbackUrls = getFallbackUrls()
		return loadBalance([
			http(proxy.http),
			...fallbackUrls.http.map((url) => http(url)),
		])
	})

export function getWagmiConfig() {
	if (wagmiConfigSingleton) return wagmiConfigSingleton
	const chain = getTempoChain()
	const transport = getTempoTransport()

	wagmiConfigSingleton = createConfig({
		ssr: true,
		multiInjectedProviderDiscovery: true,
		chains: [chain, tempoLocalnet],
		connectors: [tempoWallet()],
		storage: createStorage({ storage: cookieStorage }),
		transports: {
			[chain.id]: transport,
			[tempoLocalnet.id]: http(undefined, { batch: true }),
		} as never,
	})

	return wagmiConfigSingleton
}

export const getWagmiStateSSR = createServerFn().handler(() => {
	const cookie = getRequestHeader('cookie')
	const initialState = cookieToInitialState(getWagmiConfig(), cookie)
	return serialize(initialState || {})
})

// Batched HTTP client for bulk RPC operations
export function getBatchedClient() {
	const chain = getTempoChain()
	const transport = getTempoTransport()

	return createPublicClient({ chain, transport }).extend(tempoActions())
}

declare module 'wagmi' {
	interface Register {
		config: ReturnType<typeof getWagmiConfig>
	}
}
