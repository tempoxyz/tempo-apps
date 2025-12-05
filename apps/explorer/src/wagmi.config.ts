import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { tempoLocal, tempoTestnet } from 'tempo.ts/chains'
import type { OneOf } from 'viem'
import { createConfig, deserialize, http, serialize, webSocket } from 'wagmi'
import { hashFn } from 'wagmi/query'

const browser = typeof window !== 'undefined'

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
			[tempoTestnet.id]: !browser
				? http(rpcUrl ?? 'https://rpc-orchestra.testnet.tempo.xyz', {
						fetchOptions: {
							headers: {
								Authorization: `Basic ${btoa('eng:zealous-mayer')}`,
							},
						},
					})
				: rpcUrl
					? http(rpcUrl)
					: webSocket('wss://rpc-orchestra.testnet.tempo.xyz/zealous-mayer'),
			[tempoLocal.id]: http(undefined, {
				batch: true,
			}),
		},
	})
}

export const config = getConfig()
