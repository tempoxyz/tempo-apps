import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { tempoDevnet, tempoLocalnet, tempoTestnet } from 'viem/chains'
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

export const TESTNET_WS_URL = 'wss://proxy.tempo.xyz/rpc'
export const TESTNET_RPC_URL = 'https://proxy.tempo.xyz/rpc'

export const DEVNET_WS_URL = 'wss://rpc.devnet.tempoxyz.dev'
export const DEVNET_RPC_URL = 'https://rpc.devnet.tempoxyz.dev'

export const TEMPO_WS_URL =
	TEMPO_ENV === 'devnet' ? DEVNET_WS_URL : TESTNET_WS_URL
export const TEMPO_RPC_URL =
	TEMPO_ENV === 'devnet' ? DEVNET_RPC_URL : TESTNET_RPC_URL

const getTempoChain = createIsomorphicFn()
	.client(() => (TEMPO_ENV === 'devnet' ? tempoDevnet : tempoTestnet))
	.server(() => (TEMPO_ENV === 'devnet' ? tempoDevnet : tempoTestnet))

const getTempoTransport = createIsomorphicFn()
	.client(() => {
		if (TEMPO_ENV === 'devnet')
			return fallback([webSocket(DEVNET_WS_URL), http(DEVNET_RPC_URL)])
		return fallback([webSocket(TESTNET_WS_URL), http(TESTNET_RPC_URL)])
	})
	.server(() => {
		if (TEMPO_ENV === 'devnet')
			return fallback([webSocket(DEVNET_WS_URL), http(DEVNET_RPC_URL)])
		return fallback([webSocket(TEMPO_WS_URL), http(TEMPO_RPC_URL)])
	})

export function getWagmiConfig() {
	const chain = getTempoChain()
	const transport = getTempoTransport()

	return createConfig({
		ssr: true,
		batch: { multicall: false },
		chains: [chain, tempoLocalnet],
		storage: createStorage({ storage: cookieStorage }),
		// @ts-expect-error - dynamic chain selection causes type mismatch
		transports: {
			[chain.id]: transport,
			[tempoLocalnet.id]: http(undefined, { batch: true }),
		},
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
