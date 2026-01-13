import { env } from 'cloudflare:workers'
import {
	tempo,
	tempoDevnet,
	tempoLocalnet,
	tempoModerato,
	tempoTestnet,
} from 'viem/chains'
import { alphaUsd, doNotUseUsd } from './consts.js'

const chains = {
	devnet: tempoDevnet,
	localnet: tempoLocalnet,
	mainnet: tempo,
	moderato: tempoModerato,
	testnet: tempoTestnet,
}

type TempoEnv = keyof typeof chains

const feeTokens = {
	devnet: alphaUsd,
	localnet: alphaUsd,
	mainnet: doNotUseUsd,
	moderato: alphaUsd,
	testnet: alphaUsd,
} as const

const tempoEnv = (env.TEMPO_ENV as TempoEnv) ?? 'testnet'

export const tempoChain = (chains[tempoEnv] ?? tempoTestnet).extend({
	feeToken: feeTokens[tempoEnv] ?? alphaUsd,
})
