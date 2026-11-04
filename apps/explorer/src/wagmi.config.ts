import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest, getRequestHeader } from '@tanstack/react-start/server'
import { createPublicClient, type Transport } from 'viem'
import { tempoLocalnet } from 'viem/chains'
import { tempoActions } from 'viem/tempo'
import { loadBalance, rateLimit } from '@tempo/rpc-utils'
import {
	connectedTempoDevnet,
	tempoMainnet,
	tempoNextfork,
	tempoTestnet,
	tempoZoneProver,
} from './lib/chains'
import { getApiUrl, getTempoEnv } from './lib/env'
import { getExplorerRpcBackend } from './lib/server/network'
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
// On the server, one config per incoming request: viem batches and dedupes
// in-flight RPC calls in module-global caches keyed by client and URL, so a
// config shared across requests lets one request await a promise settled by
// another request's fetch, which the Workers runtime cancels as hung.
const serverWagmiConfigs = new WeakMap<
	Request,
	ReturnType<typeof createConfig>
>()

const chains = {
	mainnet: tempoMainnet,
	testnet: tempoTestnet,
	devnet: connectedTempoDevnet,
	nextfork: tempoNextfork,
	'zone-prover': tempoZoneProver,
}

export const getTempoChain = createIsomorphicFn()
	.client(() => chains[getTempoEnv()])
	.server(() => chains[getTempoEnv()])

function rpcHttp(
	url: string | undefined,
	options: { headers?: Record<string, string> | undefined; timeout: number },
) {
	return http(url, {
		batch: { batchSize: 50 },
		fetchOptions: { headers: options.headers, redirect: 'manual' },
		timeout: options.timeout,
	})
}

const getTempoTransport = createIsomorphicFn()
	.client(() => {
		// Credentials stay in the Worker's same-origin RPC endpoint.
		return loadBalance([
			rateLimit(
				rpcHttp(getApiUrl('/api/rpc').toString(), { timeout: 15_000 }),
				{
					requestsPerSecond: 20,
				},
			),
		])
	})
	.server(() => {
		const target = getExplorerRpcBackend(
			import.meta.env.VITE_TEMPO_ENV,
			process.env.RPC_AUTH,
		)
		return withOwnBatch(
			rpcHttp(target.url, { headers: target.headers, timeout: 15_000 }),
		)
	})

/**
 * viem queues batched calls by URL and the call's AbortSignal, across every
 * client in the isolate. Giving each client its own signal keeps a request's
 * calls in batches that request's own fetch sends.
 */
function withOwnBatch(transport: Transport): Transport {
	return (config) => {
		const value = transport(config)
		const signal = new AbortController().signal
		return {
			...value,
			request: (args, options) =>
				value.request(args, { ...options, signal: options?.signal ?? signal }),
		} as ReturnType<Transport>
	}
}

const getCurrentRequest = createIsomorphicFn()
	.client((): Request | undefined => undefined)
	.server((): Request | undefined => {
		try {
			return getRequest()
		} catch {
			return undefined
		}
	})

export function getWagmiConfig() {
	if (typeof window === 'undefined') {
		const request = getCurrentRequest()
		const cached = request && serverWagmiConfigs.get(request)
		if (cached) return cached
		const config = createWagmiConfig()
		if (request) serverWagmiConfigs.set(request, config)
		return config
	}
	if (wagmiConfigSingleton) return wagmiConfigSingleton
	wagmiConfigSingleton = createWagmiConfig()
	return wagmiConfigSingleton
}

function createWagmiConfig(): ReturnType<typeof createConfig> {
	const chain = getTempoChain()
	const transport = getTempoTransport()

	return createConfig({
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
}

// The root route's loader runs again on every preload (links preload as they
// scroll into view), so read the cookie where it already is instead of
// calling a server function: the request header on the server and
// document.cookie in the browser.
const getWagmiCookie = createIsomorphicFn()
	.server(() => getRequestHeader('cookie'))
	.client(() => document.cookie)

export function getWagmiState() {
	const initialState = cookieToInitialState(getWagmiConfig(), getWagmiCookie())
	return serialize(initialState || {})
}

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
