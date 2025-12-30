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

const vitestPoolId = String(process.env.VITEST_POOL_ID ?? 1)

export default defineWorkersConfig({
	test: {
		include: ['src/**/e2e.test.ts'],
		globalSetup: [join(__dirname, './src/test/setup.global.ts')],
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						ALLOWED_ORIGINS: '*',
						SPONSOR_PRIVATE_KEY: sponsorPrivateKey,
						TEMPO_ENV: tempoEnv,
						INDEXSUPPLY_API_KEY: 'test-key',
						// Only needed for localnet (dynamic port per test pool)
						...(tempoEnv === 'localnet' && { VITEST_POOL_ID: vitestPoolId }),
					},
				},
			},
		},
	},
})
