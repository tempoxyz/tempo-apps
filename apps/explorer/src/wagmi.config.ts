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
import { signetParmigiana, signetHost } from './lib/chains'
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

const isSignetEnv = TEMPO_ENV === 'parmigiana' || TEMPO_ENV === 'host'

export type WagmiConfig = ReturnType<typeof getWagmiConfig>
let wagmiConfigSingleton: ReturnType<typeof createConfig> | null = null

export const getTempoChain = createIsomorphicFn()
	.client(() =>
		TEMPO_ENV === 'parmigiana'
			? signetParmigiana
			: TEMPO_ENV === 'host'
				? signetHost
				: TEMPO_ENV === 'presto'
					? signetParmigiana
					: TEMPO_ENV === 'devnet'
						? tempoDevnet
						: TEMPO_ENV === 'moderato'
							? tempoModerato
							: tempoAndantino,
	)
	.server(() =>
		TEMPO_ENV === 'parmigiana'
			? signetParmigiana
			: TEMPO_ENV === 'host'
				? signetHost
				: TEMPO_ENV === 'presto'
					? signetParmigiana
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
		if (isSignetEnv) {
			// Signet RPCs are public — hit them directly
			return { http: chain.rpcUrls.default.http[0] }
		}
		return {
			http: `https://${RPC_PROXY_HOSTNAME}/rpc/${chain.id}`,
		}
	})
	.server(() => {
		const chain = getTempoChain()
		if (isSignetEnv) {
			return { http: chain.rpcUrls.default.http[0] }
		}
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
		if (isSignetEnv) return { http: [] as string[] }
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

		if (isSignetEnv) {
			// Signet RPCs are public, no proxy needed
			return http(proxy.http, { batch: true })
		}

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

		if (isSignetEnv) {
			return http(proxy.http, { batch: true })
		}

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
		chains: isSignetEnv
			? [signetParmigiana, signetHost]
			: [chain, tempoLocalnet],
		connectors: isSignetEnv
			? []
			: [
					webAuthn({
						keyManager: KeyManager.http('https://keys.tempo.xyz'),
					}),
				],
		storage: createStorage({ storage: cookieStorage }),
		transports: isSignetEnv
			? ({
					[signetParmigiana.id]: http(
						signetParmigiana.rpcUrls.default.http[0],
						{ batch: true },
					),
					[signetHost.id]: http(signetHost.rpcUrls.default.http[0], {
						batch: true,
					}),
				} as never)
			: ({
					[chain.id]: transport,
					[tempoLocalnet.id]: http(undefined, { batch: true }),
				} as never),
	})

	return wagmiConfigSingleton
}

export const getWagmiStateSSR = createServerFn().handler(() => {
	const cookie = getRequestHeader('cookie')
	const initialState = cookieToInitialState(getWagmiConfig(), cookie)
	return serialize(initialState || {})
})

/**
 * Read the active chain ID from wagmi's cookie state on the server.
 * Wagmi persists chain state to cookies via `cookieStorage`.
 * Falls back to the default chain (signetParmigiana) if not found.
 */
export function getServerChainId(): number {
	const cookie = getRequestHeader('cookie')
	const config = getWagmiConfig()
	const initialState = cookieToInitialState(config, cookie)
	return initialState?.chainId ?? config.chains[0].id
}

// Batched HTTP client for bulk RPC operations
export function getBatchedClient(chainId?: number) {
	if (isSignetEnv) {
		const chain =
			chainId === signetHost.id ? signetHost : signetParmigiana
		const transport = http(chain.rpcUrls.default.http[0], { batch: true })
		return createPublicClient({ chain, transport }).extend(tempoActions())
	}
	const chain = getTempoChain()
	const transport = getTempoTransport()
	return createPublicClient({ chain, transport }).extend(tempoActions())
}

declare module 'wagmi' {
	interface Register {
		config: ReturnType<typeof getWagmiConfig>
	}
}
