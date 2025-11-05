import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { tempoDev } from 'tempo.ts/chains'
import { createClient, type OneOf } from 'viem'
import {
	type Config,
	createConfig,
	deserialize,
	http,
	serialize,
	webSocket,
} from 'wagmi'
import * as Actions from 'wagmi/actions'

const browser = typeof window !== 'undefined'

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
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

export const config = createConfig({
	chains: [tempoDev],
	ssr: true,
	transports: {
		[tempoDev.id]: !browser
			? http('https://devnet.tempoxyz.dev', {
					fetchOptions: {
						headers: {
							Authorization: `Basic ${btoa('eng:zealous-mayer')}`,
						},
					},
				})
			: webSocket(
					'wss://devnet.tempoxyz.dev?supersecretargument=pleasedonotusemeinprod',
				),
	},
})

export function getClient<
	config extends Config,
	chainId extends config['chains'][number]['id'] | number | undefined,
>(
	config: config,
	parameters: OneOf<
		| Actions.GetClientParameters<config, chainId>
		| { rpcUrl?: string | undefined }
	> = {},
): Actions.GetClientReturnType<config, chainId> {
	const { rpcUrl } = parameters
	const client = Actions.getClient(config, parameters)
	if (rpcUrl && client) {
		return createClient({
			...client,
			chain: undefined,
			transport: http(rpcUrl) as never,
		}) as never
	}
	return client as never
}

declare module 'wagmi' {
	interface Register {
		config: typeof config
	}
}
