import { QueryClient } from '@tanstack/react-query'
import { tempoModerato } from 'viem/chains'
import { withFeePayer } from 'viem/tempo'
import { alphausd } from 'viem/tokens'
import { createConfig, http } from 'wagmi'
import { KeyManager, webAuthn } from 'wagmi/tempo'

export const alphaUsd = alphausd.addresses[tempoModerato.id]

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
	chains: [tempoModerato.extend({ feeToken: alphaUsd })],
	multiInjectedProviderDiscovery: false,
	transports: {
		[tempoModerato.id]: withFeePayer(
			// Transport for regular transactions
			http('https://rpc.testnet.tempo.xyz'),
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
