import { http, createConfig } from 'wagmi'
import { tempoDevnet } from 'viem/chains'

export const wagmiConfig = createConfig({
	multiInjectedProviderDiscovery: true,
	chains: [tempoDevnet],
	connectors: [],
	transports: {
		[tempoDevnet.id]: http(tempoDevnet.rpcUrls.default.http[0]),
	},
})

declare module 'wagmi' {
	interface Register {
		config: typeof wagmiConfig
	}
}
