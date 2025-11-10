import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { tempoAndantino } from 'tempo.ts/chains'
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

export function getConfig(
	parameters: OneOf<{ rpcUrl?: string | undefined }> = {},
) {
	const { rpcUrl } = parameters
	return createConfig({
		chains: [tempoAndantino],
		ssr: true,
		transports: {
			[tempoAndantino.id]: !browser
				? http(rpcUrl ?? 'https://rpc.testnet.tempo.xyz', {
						fetchOptions: {
							headers: {
								Authorization: `Basic ${btoa('eng:zealous-mayer')}`,
							},
						},
					})
				: rpcUrl
					? http(rpcUrl)
					: webSocket(
							'wss://rpc.testnet.tempo.xyz?supersecretargument=pleasedonotusemeinprod',
						),
		},
	})
}

export const config = getConfig()
