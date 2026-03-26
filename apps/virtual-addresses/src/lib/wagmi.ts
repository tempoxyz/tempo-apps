import { http, createConfig } from 'wagmi'
import { tempoLocalnet } from 'viem/chains'

export const wagmiConfig = createConfig({
	multiInjectedProviderDiscovery: true,
	chains: [tempoLocalnet],
	connectors: [],
	transports: {
		[tempoLocalnet.id]: http('/rpc'),
	},
})

declare module 'wagmi' {
	interface Register {
		config: typeof wagmiConfig
	}
}
