import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { createPublicClient } from 'viem'
import {
	tempoDevnet,
	tempoLocalnet,
	tempoAndantino,
	tempoModerato,
} from 'viem/chains'
import { tempoActions } from 'viem/tempo'
import { loadBalance, rateLimit } from '@tempo/rpc-utils'
import { tempoPresto } from './lib/chains'
import {
	cookieStorage,
	cookieToInitialState,
	createConfig,
	createStorage,
	http,
	serialize,
} from 'wagmi'
import { KeyManager, webAuthn } from 'wagmi/tempo'

const TEMPO_ENV = import.meta.env.VITE_TEMPO_ENV

export type WagmiConfig = ReturnType<typeof getWagmiConfig>
let wagmiConfigSingleton: ReturnType<typeof createConfig> | null = null

export const getTempoChain = createIsomorphicFn()
	.client(() =>
		TEMPO_ENV === 'presto'
			? tempoPresto
			: TEMPO_ENV === 'devnet'
				? tempoDevnet
				: TEMPO_ENV === 'moderato'
					? tempoModerato
					: tempoAndantino,
	)
	.server(() =>
		TEMPO_ENV === 'presto'
			? tempoPresto
			: TEMPO_ENV === 'devnet'
				? tempoDevnet
				: TEMPO_ENV === 'moderato'
					? tempoModerato
					: tempoAndantino,
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
		const key = process.env.TEMPO_RPC_KEY
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
		const key = process.env.TEMPO_RPC_KEY
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
		chains: [chain, tempoLocalnet],
		connectors: [
			webAuthn({
				keyManager: KeyManager.http('https://keys.tempo.xyz'),
			}),
		],
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
