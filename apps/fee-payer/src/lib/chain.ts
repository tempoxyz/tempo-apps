import { env } from 'cloudflare:workers'
import {
	tempo,
	tempoDevnet,
	tempoLocalnet,
	tempoModerato,
} from 'viem/chains'
import { alphaUsd, doNotUseUsd } from './consts.js'

const chains = {
	devnet: tempoDevnet,
	localnet: tempoLocalnet,
	mainnet: tempo,
	moderato: tempoModerato,
	testnet: tempoModerato,
}

type TempoEnv = keyof typeof chains

const feeTokens = {
	devnet: alphaUsd,
	localnet: alphaUsd,
	mainnet: doNotUseUsd,
	moderato: alphaUsd,
	testnet: alphaUsd,
} as const

const tempoEnv = (env.TEMPO_ENV as TempoEnv) ?? 'moderato'

export const tempoChain = (chains[tempoEnv] ?? tempoModerato).extend({
	feeToken: feeTokens[tempoEnv] ?? alphaUsd,
})
