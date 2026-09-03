import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { createPublicClient, fallback } from 'viem'
import { tempoDevnet, tempoLocalnet } from 'viem/chains'
import { tempoActions } from 'viem/tempo'
import { loadBalance, rateLimit } from '@tempo/rpc-utils'
import { tempoMainnet, tempoNextfork, tempoTestnet } from './lib/chains'
import { getTempoEnv } from './lib/env'
import { serverEnv, tempoApiUrl } from './lib/server/env'
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
			: getTempoEnv() === 'nextfork'
				? tempoNextfork
				: getTempoEnv() === 'devnet'
					? tempoDevnet
					: getTempoEnv() === 'testnet'
						? tempoTestnet
						: tempoMainnet,
	)
	.server(() =>
		getTempoEnv() === 'mainnet'
			? tempoMainnet
			: getTempoEnv() === 'nextfork'
				? tempoNextfork
				: getTempoEnv() === 'devnet'
					? tempoDevnet
					: getTempoEnv() === 'testnet'
						? tempoTestnet
						: tempoMainnet,
	)

const RPC_PROXY_HOSTNAME = 'proxy.tempo.xyz'
const PRIMARY_RPC_TIMEOUT_MS = 1_500
const FALLBACK_RPC_TIMEOUT_MS = 3_000

function rpcHttp(
	url: string | undefined,
	options: { headers?: Record<string, string> | undefined; timeout: number },
) {
	return http(url, {
		batch: true,
		fetchOptions: options.headers ? { headers: options.headers } : undefined,
		timeout: options.timeout,
	})
}

function getRpcProxyUrl() {
	const chain = getTempoChain()
	return {
		http: `https://${RPC_PROXY_HOSTNAME}/rpc/${chain.id}`,
	}
}

const getFallbackUrls = createIsomorphicFn()
	.client(() => ({
		// Browser requests must never hit direct RPC fallbacks.
		http: [] as string[],
	}))
	.server(() => {
		const chain = getTempoChain()
		return {
			http: [...chain.rpcUrls.default.http],
		}
	})

const getTempoTransport = createIsomorphicFn()
	.client(() => {
		const proxy = getRpcProxyUrl()

		// Browser traffic should only hit the RPC proxy. Direct chain RPC endpoints
		// may require credentials that are only available server-side.
		return loadBalance([
			rateLimit(rpcHttp(proxy.http, { timeout: FALLBACK_RPC_TIMEOUT_MS }), {
				requestsPerSecond: 20,
			}),
		])
	})
	.server(() => {
		const chain = getTempoChain()
		const proxy = getRpcProxyUrl()
		const fallbackUrls = getFallbackUrls()
		const apiKey = serverEnv.TEMPO_API_KEY
		const transports = [
			rpcHttp(proxy.http, { timeout: PRIMARY_RPC_TIMEOUT_MS }),
			...fallbackUrls.http.map((url) =>
				rpcHttp(url, { timeout: PRIMARY_RPC_TIMEOUT_MS }),
			),
		]

		// Keep the authenticated API passthrough as the final fallback. Its latency
		// is materially higher than the chain RPCs, so it should not sit on the
		// successful request path.
		if (
			apiKey &&
			(chain.id === tempoMainnet.id || chain.id === tempoTestnet.id)
		)
			transports.push(
				rpcHttp(`${tempoApiUrl}/rpc/${chain.id}`, {
					headers: { 'tempo-api-key': apiKey },
					timeout: FALLBACK_RPC_TIMEOUT_MS,
				}),
			)

		return fallback(transports)
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
