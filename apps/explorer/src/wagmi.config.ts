import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { Json } from 'ox'
import { KeyManager, webAuthn } from 'tempo.ts/wagmi'
import { createConfig, deserialize, http, serialize } from 'wagmi'
import { tempoLocalnet, tempoTestnet } from 'wagmi/chains'

const browser = typeof window !== 'undefined'

export const DEFAULT_TESTNET_RPC_URL = 'https://rpc.testnet.tempo.xyz'
export const DEFAULT_TESTNET_WS_URL = 'wss://rpc.testnet.tempo.xyz'

export const queryClient: QueryClient = new QueryClient({
	defaultOptions: {
		queries: {
			gcTime: 1_000 * 60 * 60 * 24, // 24 hours
			queryKeyHashFn: Json.stringify,
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
	serialize,
	deserialize,
	key: `tempo-query-cache-${__BUILD_VERSION__}`,
	storage: browser ? window.localStorage : undefined,
})

export const config = createConfig({
	ssr: true,
	chains: [
		import.meta.env.VITE_LOCALNET === 'true'
			? tempoLocalnet
			: tempoTestnet.extend({
					feeToken: '0x20c0000000000000000000000000000000000001',
				}),
	],
	connectors: [
		webAuthn({
			keyManager: KeyManager.http(`${__BASE_URL__}/api/webauthn`),
		}),
	],
	batch: { multicall: false },
	multiInjectedProviderDiscovery: false,
	transports: {
		[tempoTestnet.id]: http(DEFAULT_TESTNET_RPC_URL, { batch: true }),
		[tempoLocalnet.id]: http(undefined, { batch: true }),
	},
})

declare module 'wagmi' {
	interface Register {
		config: typeof config
	}
}
