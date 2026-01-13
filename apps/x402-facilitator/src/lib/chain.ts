import { env } from 'cloudflare:workers'
import { tempoDevnet, tempoModerato, tempoTestnet } from 'viem/chains'

const chains = {
	devnet: tempoDevnet,
	moderato: tempoModerato,
	testnet: tempoTestnet,
}

type TempoEnv = keyof typeof chains

// @ts-expect-error - Env types will be resolved with worker deployment
export const tempoChain = (chains[env.TEMPO_ENV as TempoEnv] ?? tempoTestnet).extend({
	// @ts-expect-error - Env types will be resolved with worker deployment
	feeToken: env.FEE_TOKEN as `0x${string}`,
})
