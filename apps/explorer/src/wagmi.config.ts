import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { tempoLocalnet, tempoTestnet } from 'viem/chains'
import {
	cookieStorage,
	cookieToInitialState,
	createConfig,
	createStorage,
	http,
	serialize,
	webSocket,
} from 'wagmi'

export const DEFAULT_TESTNET_RPC_URL = 'https://rpc.testnet.tempo.xyz'
export const DEFAULT_TESTNET_WS_URL = 'wss://rpc.testnet.tempo.xyz'

const getTempoRpcUrl = createIsomorphicFn()
	.server(() => ({
		http: `${DEFAULT_TESTNET_RPC_URL}/${process.env.TEMPO_RPC_KEY}`,
		websocket: `${DEFAULT_TESTNET_WS_URL}/${process.env.TEMPO_RPC_KEY}`,
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
			[tempoTestnet.id]: webSocket(rpcUrl.websocket),
			[tempoLocalnet.id]: http(undefined, { batch: true }),
		},
	})
}

export const getWagmiStateSSR = createServerFn().handler(() => {
	const cookie = getRequestHeader('cookie')
	const initialState = cookieToInitialState(getWagmiConfig(), cookie)
	return serialize(initialState)
})
