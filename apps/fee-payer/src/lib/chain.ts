import { env } from 'cloudflare:workers'
import {
	tempo,
	tempoDevnet,
	tempoLocalnet,
	tempoModerato,
} from 'viem/chains'
import type { Chain } from 'viem/chains'
import { alphaUsd, doNotUseUsd } from './consts.js'

type CanonicalTempoEnv = 'devnet' | 'localnet' | 'mainnet' | 'moderato'
type TempoEnv = CanonicalTempoEnv | 'testnet'

const chains = {
	devnet: tempoDevnet,
	localnet: tempoLocalnet,
        mainnet: tempo,
        moderato: tempoModerato,
} as const satisfies Record<CanonicalTempoEnv, Chain>

const feeTokens = {
	devnet: alphaUsd,
	localnet: alphaUsd,
	mainnet: doNotUseUsd,
	moderato: alphaUsd,
} as const satisfies Record<CanonicalTempoEnv, `0x${string}`>

const rawTempoEnv = (env.TEMPO_ENV as TempoEnv | undefined) ?? 'moderato'
const tempoEnv: CanonicalTempoEnv =
        rawTempoEnv === 'testnet' ? 'moderato' : rawTempoEnv

export const tempoChain = chains[tempoEnv].extend({
        feeToken: feeTokens[tempoEnv],
})
