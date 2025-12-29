import { env } from 'cloudflare:workers'
import { tempoDevnet, tempoLocalnet, tempoTestnet } from 'viem/chains'
import { alphaUsd } from './consts.js'

export const tempoChain = (() => {
	if (env.TEMPO_ENV === 'devnet')
		return tempoDevnet.extend({ feeToken: alphaUsd })
	if (env.TEMPO_ENV === 'localnet')
		return tempoLocalnet.extend({ feeToken: alphaUsd })
	return tempoTestnet.extend({ feeToken: alphaUsd })
})()
