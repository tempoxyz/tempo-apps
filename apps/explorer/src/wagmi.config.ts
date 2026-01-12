import {
	createIsomorphicFn,
	createServerFn,
	createServerOnlyFn,
} from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import {
	tempoDevnet,
	tempoLocalnet,
	tempoAndantino,
	tempoModerato,
} from 'viem/chains'
import { tempoPresto } from './lib/chains'
import { createPublicClient } from 'viem'
import { tempoActions } from 'viem/tempo'
import {
	cookieStorage,
	cookieToInitialState,
	createConfig,
	createStorage,
	fallback,
	http,
	serialize,
	webSocket,
} from 'wagmi'

const TEMPO_ENV = import.meta.env.VITE_TEMPO_ENV

export type WagmiConfig = ReturnType<typeof getWagmiConfig>

const getWsUrls = createIsomorphicFn()
	.client(() =>
		[
			import.meta.env.VITE_TEMPO_RPC_WS,
			import.meta.env.VITE_TEMPO_RPC_WS_FALLBACK,
		].filter(Boolean),
	)
	.server(() =>
		[
			process.env.VITE_TEMPO_RPC_WS,
			process.env.VITE_TEMPO_RPC_WS_FALLBACK,
		].filter(Boolean),
	)

const getHttpUrls = createIsomorphicFn()
	.client(() =>
		[
			import.meta.env.VITE_TEMPO_RPC_HTTP,
			import.meta.env.VITE_TEMPO_RPC_HTTP_FALLBACK,
		].filter(Boolean),
	)
	.server(() =>
		[
			process.env.VITE_TEMPO_RPC_HTTP,
			process.env.VITE_TEMPO_RPC_HTTP_FALLBACK,
		].filter(Boolean),
	)

const getTempoRpcKey = createServerOnlyFn(() => process.env.TEMPO_RPC_KEY)

export const getTempoChain = createIsomorphicFn()
	.client(() =>
		TEMPO_ENV === 'presto'
			? tempoPresto
			: TEMPO_ENV === 'devnet'
				? tempoDevnet
				: TEMPO_ENV === 'moderato'
					? tempoModerato
					: tempoAndantino,
	)
	.server(() =>
		TEMPO_ENV === 'presto'
			? tempoPresto
			: TEMPO_ENV === 'devnet'
				? tempoDevnet
				: TEMPO_ENV === 'moderato'
					? tempoModerato
					: tempoAndantino,
	)

const getTempoTransport = createIsomorphicFn()
	.client(() =>
		fallback([
			...getWsUrls().map((u) => webSocket(u)),
			...getHttpUrls().map((u) => http(u)),
		]),
	)
	.server(() => {
		const rpcKey = getTempoRpcKey()
		if (rpcKey === '__FORWARD__') {
			const authHeader = getRequestHeader('authorization')
			return fallback([
				...getWsUrls().map((url) => webSocket(url)),
				...getHttpUrls().map((url) =>
					http(url, {
						fetchOptions: { headers: { Authorization: authHeader ?? '' } },
					})
				),
			])
		}
		return fallback([
			...getWsUrls().map((url) => webSocket(`${url}/${rpcKey}`)),
			...getHttpUrls().map((url) => http(`${url}/${rpcKey}`)),
		])
	})

export function getWagmiConfig() {
	const chain = getTempoChain()
	const transport = getTempoTransport()

	return createConfig({
		ssr: true,
		batch: { multicall: false },
		chains: [chain, tempoLocalnet],
		storage: createStorage({ storage: cookieStorage }),
		transports: {
			[chain.id]: transport,
			[tempoLocalnet.id]: http(undefined, { batch: true }),
		} as never,
	})
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
