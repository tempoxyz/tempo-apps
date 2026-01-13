import {
	createIsomorphicFn,
	createServerFn,
	createServerOnlyFn,
} from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { RPC_AUTH_COOKIE } from './index.server'
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
		const forwardAuth = process.env.FORWARD_RPC_AUTH === '1'
		const withKey = (url: string) => (rpcKey ? `${url}/${rpcKey}` : url)
		const sanitize = (str: string) =>
			rpcKey ? str.replaceAll(rpcKey, '[REDACTED]') : str
		const safeHttp = (
			url: string,
			opts?: Parameters<typeof http>[1],
		): ReturnType<typeof http> => {
			const transport = http(url, opts)
			return (args) => {
				const result = transport(args)
				return {
					...result,
					async request(params) {
						try {
							return await result.request(params)
						} catch (error) {
							if (error instanceof Error)
								error.message = sanitize(error.message)
							throw error
						}
					},
				}
			}
		}
		if (forwardAuth) {
			let authHeader = getRequestHeader('authorization')
			if (!authHeader) {
				const cookies = getRequestHeader('cookie')
				const prefix = `${RPC_AUTH_COOKIE}=`
				const cookie = cookies?.split('; ').find((c) => c.startsWith(prefix))
				if (cookie) authHeader = `Basic ${cookie.slice(prefix.length)}`
			}
			return fallback(
				getHttpUrls().map((url) =>
					safeHttp(withKey(url), {
						fetchOptions: { headers: { Authorization: authHeader ?? '' } },
					}),
				),
			)
		}
		return fallback([
			...getWsUrls().map((url) => webSocket(withKey(url))),
			...getHttpUrls().map((url) => safeHttp(withKey(url))),
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
