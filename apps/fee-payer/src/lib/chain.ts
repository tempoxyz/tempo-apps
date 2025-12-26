import { env } from 'cloudflare:workers'
import { tempoDevnet, tempoTestnet } from 'viem/chains'
import { alphaUsd } from './consts.js'

export const tempoChain =
	env.TEMPO_ENV === 'devnet'
		? tempoDevnet.extend({ feeToken: alphaUsd })
		: tempoTestnet.extend({ feeToken: alphaUsd })
