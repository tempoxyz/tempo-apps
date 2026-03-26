import { http, createConfig } from 'wagmi'
import { tempoModerato } from 'viem/chains'

export const wagmiConfig = createConfig({
	multiInjectedProviderDiscovery: true,
	chains: [tempoModerato],
	connectors: [],
	transports: {
		[tempoModerato.id]: http(),
	},
})

declare module 'wagmi' {
	interface Register {
		config: typeof wagmiConfig
	}
}
