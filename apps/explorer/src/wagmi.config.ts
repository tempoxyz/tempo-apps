import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { createPublicClient } from 'viem'
import { tempoDevnet, tempoLocalnet } from 'viem/chains'
import { tempoActions } from 'viem/tempo'
import { loadBalance, rateLimit } from '@tempo/rpc-utils'
import {
	tempoMainnet,
	tempoNextfork,
	tempoTestnet,
	tempoZoneProver,
} from './lib/chains'
import { getApiUrl, getTempoEnv } from './lib/env'
import { getPreviewChain } from './lib/preview-chain'
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

const chains = {
	mainnet: tempoMainnet,
	testnet: tempoTestnet,
	devnet: tempoDevnet,
	nextfork: tempoNextfork,
	'zone-prover': tempoZoneProver,
}

export const getTempoChain = createIsomorphicFn()
	.client(() => {
		const environment = getTempoEnv()
		return environment === 'preview' ? getPreviewChain() : chains[environment]
	})
	.server(() => {
		const environment = getTempoEnv()
		return environment === 'preview' ? getPreviewChain() : chains[environment]
	})

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
		return rpcHttp(target.url, { headers: target.headers, timeout: 15_000 })
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
