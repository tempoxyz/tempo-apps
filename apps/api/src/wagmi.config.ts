import { Address } from 'ox'
import * as z from 'zod/mini'
import { createConfig, fallback, http } from 'wagmi'
import { tempoDevnet, tempoModerato } from 'wagmi/chains'

export const tempoPresto = {
	...tempoModerato,
	id: 4217,
	name: 'Tempo Mainnet',
	blockExplorers: {
		default: { name: 'Tempo Explorer', url: 'https://explore.tempo.xyz' },
	},
	rpcUrls: {
		default: {
			http: [process.env.TEMPO_MAINNET_RPC_URL],
		},
	},
} as const

export const wagmiConfig = createConfig({
	chains: [tempoDevnet, tempoPresto, tempoModerato],
	transports: {
		[tempoModerato.id]: fallback([
			http(tempoModerato.rpcUrls.default.http.at(0)),
		]),
		[tempoDevnet.id]: fallback([http(tempoDevnet.rpcUrls.default.http.at(0))]),
		[tempoPresto.id]: fallback([http(tempoPresto.rpcUrls.default.http.at(0))]),
	},
})

export const zAddress = (opts?: { lowercase?: boolean }) =>
	z.pipe(
		z.string(),
		z.transform((x) => {
			if (opts?.lowercase) x = x.toLowerCase()
			Address.assert(x)
			return x
		}),
	)

export const zChainId = () =>
	z.pipe(
		z.coerce.number(),
		z.union(wagmiConfig.chains.map((chain) => z.literal(chain.id))),
	)

declare module 'wagmi' {
	interface Register {
		config: typeof wagmiConfig
	}
}
