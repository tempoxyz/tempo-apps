import { http, createConfig } from 'wagmi'
import { tempoModerato } from 'viem/chains'

export const wagmiConfig = createConfig({
	chains: [tempoModerato],
	transports: {
		[tempoModerato.id]: http(),
	},
})

declare module 'wagmi' {
	interface Register {
		config: typeof wagmiConfig
	}
}
