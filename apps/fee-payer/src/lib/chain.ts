import { env } from 'cloudflare:workers'
import { tempoDevnet, tempoLocalnet, tempoTestnet } from 'viem/chains'
import { alphaUsd } from './consts.js'

const chains = {
	devnet: tempoDevnet,
	localnet: tempoLocalnet,
	testnet: tempoTestnet,
}

type TempoEnv = keyof typeof chains

export const tempoChain = (
	chains[env.TEMPO_ENV as TempoEnv] ?? tempoTestnet
).extend({ feeToken: alphaUsd })
