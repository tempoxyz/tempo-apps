import { Address } from 'ox'
import * as z from 'zod/mini'
import { tempoDevnet, tempoMainnet, tempoTestnet } from '@wagmi/core/chains'

const verifierUrl =
	import.meta.env?.VITE_VERIFIER_URL ?? 'https://contracts.tempo.xyz'

export const tempoMainnetExtended = tempoMainnet.extend({
	verifierUrl,
	feeToken: '0x20c0000000000000000000000000000000000000',
})

export const tempoDevnetExtended = tempoDevnet.extend({
	verifierUrl,
	feeToken: '0x20c0000000000000000000000000000000000000',
})

export const tempoTestnetExtended = tempoTestnet.extend({
	verifierUrl,
	feeToken: '0x20c0000000000000000000000000000000000001',
})

/** Static Tempo chains -- always available, cannot be overridden by dynamic config. */
export const staticChains = [
	tempoDevnetExtended,
	tempoTestnetExtended,
	tempoMainnetExtended,
] as const

export const chainFeeTokens = {
	[tempoDevnet.id]: tempoDevnetExtended.feeToken,
	[tempoTestnet.id]: tempoTestnetExtended.feeToken,
	[tempoMainnet.id]: tempoMainnetExtended.feeToken,
} as const

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
		z.string(),
		z.transform((x) => {
			const n = Number.parseInt(x, 10)
			if (Number.isNaN(n)) throw new Error('Invalid chain ID')
			return n
		}),
	)
