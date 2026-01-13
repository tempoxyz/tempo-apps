import { QueryClient } from '@tanstack/react-query'
import { tempoTestnet } from 'viem/chains'
import { withFeePayer } from 'viem/tempo'
import { createConfig, http, webSocket } from 'wagmi'
import { KeyManager, webAuthn } from 'wagmi/tempo'

export const alphaUsd = '0x20c0000000000000000000000000000000000001'

export const queryClient = new QueryClient()

export const config = createConfig({
	batch: {
		multicall: false,
	},
	connectors: [
		webAuthn({
			keyManager: KeyManager.localStorage(),
		}),
	],
	chains: [tempoTestnet.extend({ feeToken: alphaUsd })],
	multiInjectedProviderDiscovery: false,
	transports: {
		[tempoTestnet.id]: withFeePayer(
			// Transport for regular transactions
			webSocket('wss://rpc.testnet.tempo.xyz'),
			// Transport for sponsored transactions (feePayer: true)
			http(import.meta.env.VITE_FEE_PAYER_URL ?? 'http://localhost:8787'),
		),
	},
})

declare module 'wagmi' {
	interface Register {
		config: typeof config
	}
}
