import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { createPublicClient } from 'viem'
import { tempoDevnet, tempoLocalnet } from 'viem/chains'
import { tempoActions } from 'viem/tempo'
import { loadBalance, rateLimit } from '@tempo/rpc-utils'
import { tempoMainnet, tempoNextfork, tempoTestnet } from './lib/chains'
import { getLocalnetChainId, getLocalnetRpcUrl, getTempoEnv } from './lib/env'
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

function getTempoLocalnet() {
	const rpcUrl = getLocalnetRpcUrl()

	return tempoLocalnet.extend({
		id: getLocalnetChainId(),
		rpcUrls: {
			default: { http: [rpcUrl] },
			public: { http: [rpcUrl] },
		},
		feeToken: '0x20c0000000000000000000000000000000000002',
	})
}

export const getTempoChain = createIsomorphicFn()
	.client(() =>
		getTempoEnv() === 'mainnet'
			? tempoMainnet
			: getTempoEnv() === 'nextfork'
				? tempoNextfork
				: getTempoEnv() === 'devnet'
					? tempoDevnet
					: getTempoEnv() === 'localnet'
						? getTempoLocalnet()
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
					: getTempoEnv() === 'localnet'
						? getTempoLocalnet()
						: getTempoEnv() === 'testnet'
							? tempoTestnet
							: tempoMainnet,
	)

const RPC_PROXY_HOSTNAME = 'proxy.tempo.xyz'
const LOCALNET_RPC_TIMEOUT_MS = 5_000

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
		if (getTempoEnv() === 'localnet') {
			return http(getLocalnetRpcUrl(), {
				timeout: LOCALNET_RPC_TIMEOUT_MS,
			})
		}

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
		const chain = getTempoChain()

		if (getTempoEnv() === 'localnet') {
			return http(getLocalnetRpcUrl(), {
				timeout: LOCALNET_RPC_TIMEOUT_MS,
			})
		}

		// Tempo API RPC passthrough (mainnet + testnet; requires an API key).
		const apiKey = serverEnv.TEMPO_API_KEY
		if (
			apiKey &&
			(chain.id === tempoMainnet.id || chain.id === tempoTestnet.id)
		)
			return http(`${tempoApiUrl}/rpc?chainId=${chain.id}`, {
				fetchOptions: { headers: { 'tempo-api-key': apiKey } },
			})

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
	const extraChains = chain.id === tempoLocalnet.id ? [] : [tempoLocalnet]
	const extraTransports =
		chain.id === tempoLocalnet.id
			? {}
			: { [tempoLocalnet.id]: http(undefined, { batch: true }) }

	wagmiConfigSingleton = createConfig({
		ssr: true,
		multiInjectedProviderDiscovery: true,
		chains: [chain, ...extraChains],
		connectors: [tempoWallet()],
		storage: createStorage({ storage: cookieStorage }),
		transports: {
			[chain.id]: transport,
			...extraTransports,
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
