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

const WS_URLS = [
	import.meta.env.VITE_TEMPO_RPC_WS,
	import.meta.env.VITE_TEMPO_RPC_WS_FALLBACK,
].filter(Boolean)

const HTTP_URLS = [
	import.meta.env.VITE_TEMPO_RPC_HTTP,
	import.meta.env.VITE_TEMPO_RPC_HTTP_FALLBACK,
].filter(Boolean)

<<<<<<< HEAD
export const MODERATO_WS_URLs = [
	'wss://proxy.tempo.xyz/rpc/42431',
	'wss://rpc.moderato.tempo.xyz',
]
export const MODERATO_RPC_URLs = [
	'https://proxy.tempo.xyz/rpc/42431',
	'https://rpc.moderato.tempo.xyz',
]

export const PRESTO_WS_URLs = [
	'wss://proxy.tempo.xyz/rpc/4217',
	'wss://rpc.presto.tempo.xyz',
]
export const PRESTO_RPC_URLs = [
	'https://proxy.tempo.xyz/rpc/4217',
	'https://rpc.presto.tempo.xyz',
]

const getTempoRpcKey = createServerOnlyFn(() =>
	TEMPO_ENV === 'presto'
		? process.env.TEMPO_RPC_KEY_PRESTO
		: TEMPO_ENV === 'devnet'
			? process.env.TEMPO_RPC_KEY_DEVNET
			: TEMPO_ENV === 'moderato'
				? process.env.TEMPO_RPC_KEY_MODERATO
				: process.env.TEMPO_RPC_KEY_TESTNET,
)
=======
const getTempoRpcKey = createServerOnlyFn(() => process.env.TEMPO_RPC_KEY)
>>>>>>> main

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
<<<<<<< HEAD
		fallback(
			TEMPO_ENV === 'presto'
				? [
						...PRESTO_WS_URLs.map((u) => webSocket(u)),
						...PRESTO_RPC_URLs.map((u) => http(u)),
					]
				: TEMPO_ENV === 'devnet'
					? [
							...DEVNET_WS_URLs.map((u) => webSocket(u)),
							...DEVNET_RPC_URLs.map((u) => http(u)),
						]
					: TEMPO_ENV === 'moderato'
						? [
								...MODERATO_WS_URLs.map((u) => webSocket(u)),
								...MODERATO_RPC_URLs.map((u) => http(u)),
							]
						: [
								...ANDANTINO_WS_URLs.map((u) => webSocket(u)),
								...ANDANTINO_RPC_URLs.map((u) => http(u)),
							],
		),
	)
	.server(() => {
		const rpcKey = getTempoRpcKey()
		const [wsUrls, httpUrls] =
			TEMPO_ENV === 'presto'
				? [PRESTO_WS_URLs, PRESTO_RPC_URLs]
				: TEMPO_ENV === 'devnet'
					? [DEVNET_WS_URLs, DEVNET_RPC_URLs]
					: TEMPO_ENV === 'moderato'
						? [MODERATO_WS_URLs, MODERATO_RPC_URLs]
						: [ANDANTINO_WS_URLs, ANDANTINO_RPC_URLs]
=======
		fallback([
			...WS_URLS.map((u) => webSocket(u)),
			...HTTP_URLS.map((u) => http(u)),
		]),
	)
	.server(() => {
		const rpcKey = getTempoRpcKey()
>>>>>>> main
		return fallback([
			...WS_URLS.map((url) => webSocket(`${url}/${rpcKey}`)),
			...HTTP_URLS.map((url) => http(`${url}/${rpcKey}`)),
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
