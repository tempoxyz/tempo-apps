import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { tempoLocal, tempoTestnet } from 'tempo.ts/chains'
import type { OneOf } from 'viem'
import { createConfig, deserialize, http, serialize, webSocket } from 'wagmi'
import { hashFn } from 'wagmi/query'

const browser = typeof window !== 'undefined'

export const DEFAULT_TESTNET_RPC_URL = 'https://rpc-orchestra.testnet.tempo.xyz'
export const DEFAULT_TESTNET_WS_URL = 'wss://rpc-orchestra.testnet.tempo.xyz'

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 60 * 1_000, // needed for SSR
			queryKeyHashFn: hashFn,
			refetchOnWindowFocus: false,
			gcTime: 1_000 * 60 * 60 * 24, // 24 hours
		},
	},
})

export const persister = createAsyncStoragePersister({
	// Cache key includes build version - automatically invalidates on new deploys
	key: `tempo-query-cache-${__BUILD_VERSION__}`,
	serialize,
	storage: browser ? window.localStorage : undefined,
	deserialize,
})

const chain =
	import.meta.env.VITE_LOCALNET === 'true'
		? tempoLocal({ feeToken: 1n })
		: tempoTestnet({ feeToken: 1n })

export function getConfig(
	parameters: OneOf<{ rpcUrl?: string | undefined }> = {},
) {
	const { rpcUrl } = parameters
	return createConfig({
		chains: [chain],
		ssr: true,
		batch: { multicall: false },
		transports: {
			[tempoTestnet.id]: browser
				? webSocket(DEFAULT_TESTNET_WS_URL)
				: http(rpcUrl ?? DEFAULT_TESTNET_RPC_URL),
			[tempoLocal.id]: http(undefined, {
				batch: true,
			}),
		},
	})
}

export const config = getConfig()
