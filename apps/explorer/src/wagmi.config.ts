import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { tempoLocalnet, tempoTestnet } from 'viem/chains'
import {
	createConfig,
	deserialize,
	fallback,
	http,
	serialize,
	webSocket,
} from 'wagmi'
import { hashFn } from 'wagmi/query'

export const DEFAULT_TESTNET_RPC_URL = 'https://rpc.testnet.tempo.xyz'
export const DEFAULT_TESTNET_WS_URL = 'wss://rpc.testnet.tempo.xyz'

const browser = typeof window !== 'undefined'

export const queryClient: QueryClient = new QueryClient({
	defaultOptions: {
		queries: {
			gcTime: 1_000 * 60 * 60 * 24, // 24 hours
			queryKeyHashFn: hashFn,
			refetchOnReconnect: () => !queryClient.isMutating(),
			retry: 0,
		},
	},
	mutationCache: new MutationCache({
		onError: (error) => {
			if (import.meta.env.MODE !== 'development') return
			console.error(error)
		},
	}),
	queryCache: new QueryCache({
		onError: (error, query) => {
			if (import.meta.env.MODE !== 'development') return
			if (query.state.data !== undefined) console.error('[tsq]', error)
		},
	}),
})

export const persister = createAsyncStoragePersister({
	// Cache key includes build version - automatically invalidates on new deploys
	key: `tempo-query-cache-${__BUILD_VERSION__}`,
	serialize,
	storage: browser ? window.localStorage : undefined,
	deserialize,
})

const chain =
	import.meta.env.VITE_LOCALNET === 'true' ? tempoLocalnet : tempoTestnet

export const config = createConfig({
	chains: [chain],
	ssr: true,
	batch: { multicall: false },
	transports: {
		[tempoTestnet.id]: browser
			? fallback([
					webSocket(DEFAULT_TESTNET_WS_URL),
					http(DEFAULT_TESTNET_RPC_URL, { batch: true }),
				])
			: http(DEFAULT_TESTNET_RPC_URL, { batch: true }),
		[tempoLocalnet.id]: http(undefined, { batch: true }),
	},
})

declare module 'wagmi' {
	interface Register {
		config: typeof config
	}
}
