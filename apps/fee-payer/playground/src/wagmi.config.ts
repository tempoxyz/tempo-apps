import { QueryClient } from '@tanstack/react-query'
import { tempoTestnet } from 'tempo.ts/chains'
import { withFeePayer } from 'tempo.ts/viem'
import { KeyManager, webAuthn } from 'tempo.ts/wagmi'
import { createConfig, http, webSocket } from 'wagmi'

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
	chains: [tempoTestnet({ feeToken: alphaUsd })],
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
