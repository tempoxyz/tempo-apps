import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { tempoDevnet, tempoLocalnet, tempoModerato } from 'viem/chains'
import { tempoPresto } from './lib/chains'
import { custom } from 'viem'
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

export const getTempoChain = createIsomorphicFn()
	.client(() =>
		TEMPO_ENV === 'presto'
			? tempoPresto
			: TEMPO_ENV === 'devnet'
				? tempoDevnet
				: tempoModerato,
	)
	.server(() =>
		TEMPO_ENV === 'presto'
			? tempoPresto
			: TEMPO_ENV === 'devnet'
				? tempoDevnet
				: tempoModerato,
	)

const getRpcUrls = createIsomorphicFn()
	.client(() => {
		const chain = getTempoChain()
		return chain.rpcUrls.default
	})
	.server(() => {
		const chain = getTempoChain()
		const isPresto = TEMPO_ENV === 'presto'
		// Presto uses HTTP Basic Auth (not path-based key), so don't append key to URL
		if (isPresto) {
			return chain.rpcUrls.default
		}
		return {
			webSocket: chain.rpcUrls.default.webSocket.map(
				(url: string) => `${url}/${process.env.TEMPO_RPC_KEY}`,
			),
			http: chain.rpcUrls.default.http.map(
				(url: string) => `${url}/${process.env.TEMPO_RPC_KEY}`,
			),
		}
	})

const getPrestoAuth = createIsomorphicFn()
	.client(() => undefined)
	.server(() => {
		const auth = process.env.PRESTO_RPC_AUTH
		if (!auth) return undefined
		return `Basic ${Buffer.from(auth).toString('base64')}`
	})

function getTempoTransport() {
	const rpcUrls = getRpcUrls()
	const isPresto = TEMPO_ENV === 'presto'

	// Presto: no WebSocket, use HTTP Basic Auth via custom transport
	if (isPresto) {
		const auth = getPrestoAuth()
		const rpcUrl = rpcUrls.http[0]
		return custom({
			async request({ method, params }) {
				const response = await fetch(rpcUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(auth ? { Authorization: auth } : {}),
					},
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
				})
				const data = (await response.json()) as {
					result?: unknown
					error?: { message: string }
				}
				if (data.error) throw new Error(data.error.message)
				return data.result
			},
		})
	}

	return fallback([
		...rpcUrls.http.map((url: string) => http(url, { batch: true })),
		...rpcUrls.webSocket.map(webSocket),
	])
}

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

declare module 'wagmi' {
	interface Register {
		config: ReturnType<typeof getWagmiConfig>
	}
}
