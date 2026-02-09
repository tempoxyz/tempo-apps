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

const batchHttp = (url: string | undefined) =>
	http(url, { batch: { batchSize: 100, wait: 10 } })

export const wagmiConfig = createConfig({
	batch: { multicall: false },
	chains: [tempoDevnet, tempoPresto, tempoModerato],
	transports: {
		[tempoModerato.id]: fallback([
			batchHttp(
				process.env.TEMPO_TESTNET_RPC_URL ??
					tempoModerato.rpcUrls.default.http.at(0),
			),
		]),
		[tempoDevnet.id]: fallback([
			batchHttp(tempoDevnet.rpcUrls.default.http.at(0)),
		]),
		[tempoPresto.id]: fallback([
			batchHttp(tempoPresto.rpcUrls.default.http.at(0)),
		]),
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
