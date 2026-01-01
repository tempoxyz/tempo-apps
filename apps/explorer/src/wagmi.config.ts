import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { tempoLocalnet, tempoTestnet } from 'viem/chains'
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

export const DEFAULT_TESTNET_RPC_URL = 'https://proxy.tempo.xyz/rpc'
export const DEFAULT_TESTNET_WS_URL = 'wss://proxy.tempo.xyz/rpc'

const getTempoRpcUrl = createIsomorphicFn()
	.server(() => ({
		http: DEFAULT_TESTNET_RPC_URL,
		websocket: DEFAULT_TESTNET_WS_URL,
	}))
	.client(() => ({
		http: DEFAULT_TESTNET_RPC_URL,
		websocket: DEFAULT_TESTNET_WS_URL,
	}))

declare module 'wagmi' {
	interface Register {
		config: ReturnType<typeof getWagmiConfig>
	}
}

export type WagmiConfig = ReturnType<typeof getWagmiConfig>

export const getChain = createIsomorphicFn()
	.client(() =>
		import.meta.env.VITE_LOCALNET === 'true' ? tempoLocalnet : tempoTestnet,
	)
	.server(() =>
		import.meta.env.VITE_LOCALNET === 'true' ? tempoLocalnet : tempoTestnet,
	)

export const getChainId = createIsomorphicFn()
	.client(() => getChain().id)
	.server(() => getChain().id)

export function getWagmiConfig() {
	const rpcUrl = getTempoRpcUrl()

	return createConfig({
		chains: [getChain()],
		ssr: true,
		batch: { multicall: false },
		storage: createStorage({ storage: cookieStorage }),
		transports: {
			[tempoTestnet.id]: fallback([
				webSocket(rpcUrl.websocket),
				http(rpcUrl.http),
			]),
			[tempoLocalnet.id]: http(undefined, { batch: true }),
		},
	})
}

export const getWagmiStateSSR = createServerFn().handler(() => {
	const cookie = getRequestHeader('cookie')
	const initialState = cookieToInitialState(getWagmiConfig(), cookie)
	return serialize(initialState || {})
})
