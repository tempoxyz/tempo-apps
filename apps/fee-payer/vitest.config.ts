import { join } from 'node:path'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import { Mnemonic } from 'ox'

const tempoEnv = process.env.TEMPO_ENV ?? 'localnet'

const testMnemonic =
	'test test test test test test test test test test test junk'
const sponsorPrivateKey = Mnemonic.toPrivateKey(testMnemonic, {
	as: 'Hex',
	path: Mnemonic.path({ account: 0 }),
})

const rpcUrl = (() => {
	if (tempoEnv === 'testnet') return 'https://rpc.testnet.tempo.xyz'
	if (tempoEnv === 'devnet') return 'https://rpc.devnet.tempoxyz.dev'
	const poolId = Number(process.env.VITEST_POOL_ID ?? 1)
	return `http://localhost:9545/${poolId}`
})()

export default defineWorkersConfig({
	test: {
		include: ['**/e2e.test.ts', '**/*.test.ts'],
		globalSetup: [join(__dirname, './test/setup.global.ts')],
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						ALLOWED_ORIGINS: '*',
						SPONSOR_PRIVATE_KEY: sponsorPrivateKey,
						TEMPO_RPC_URL: rpcUrl,
						TEMPO_ENV: tempoEnv,
						INDEXSUPPLY_API_KEY: 'test-key',
					},
				},
			},
		},
	},
})
