import { tempoLocalnet, tempoTestnet } from 'viem/chains'
import { createConfig, fallback, http, webSocket } from 'wagmi'

export const DEFAULT_TESTNET_RPC_URL = 'https://rpc.testnet.tempo.xyz'
export const DEFAULT_TESTNET_WS_URL = 'wss://rpc.testnet.tempo.xyz'

const browser = typeof window !== 'undefined'

const chain =
	import.meta.env.VITE_LOCALNET === 'true' ? tempoLocalnet : tempoTestnet

export const config = createConfig({
	chains: [chain],
	ssr: true,
	batch: { multicall: false },
	transports: {
		[tempoTestnet.id]: browser
			? fallback([
					webSocket(DEFAULT_TESTNET_WS_URL),
					http(DEFAULT_TESTNET_RPC_URL),
				])
			: http(DEFAULT_TESTNET_RPC_URL),
		[tempoLocalnet.id]: http(undefined, { batch: true }),
	},
})

declare module 'wagmi' {
	interface Register {
		config: typeof config
	}
}
