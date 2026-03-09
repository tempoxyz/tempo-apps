import path from 'node:path'
import {
	defineWorkersConfig,
	readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config'

import wranglerJSON from '#wrangler.json' with { type: 'json' }
import { counterFixture } from './test/fixtures/counter.fixture.ts'

export default defineWorkersConfig(
	// @ts-expect-error - TODO: investigate this type issue (it's not a blocker)
	async () => {
		const migrationsPath = path.join(import.meta.dirname, 'database/drizzle')
		const migrations = await readD1Migrations(migrationsPath)

		return {
			test: {
				setupFiles: ['./test/setup.ts'],
				include: ['test/**/*.test.ts'],
				exclude: ['**/_/**'],
				coverage: {
					provider: 'istanbul',
				},
				deps: {
					optimizer: {
						ssr: {
							enabled: true,
							include: ['devalue'],
						},
					},
				},
				poolOptions: {
					workers: {
						isolatedStorage: true,
						singleWorker: true,
						main: './src/index.tsx',
						miniflare: {
							compatibilityDate: wranglerJSON.compatibility_date,
							compatibilityFlags: wranglerJSON.compatibility_flags,
							bindings: {
								NODE_ENV: 'test',
								BUN_VERSION: '1.3.8',
								TEMPO_RPC_KEY: 'test-key',
								WHITELISTED_ORIGINS: 'http://localhost',
								TEST_MIGRATIONS: migrations,
								TEST_COMPILER_RESPONSE: JSON.stringify(
									counterFixture.solcOutput,
								),
							},
							d1Databases: {
								CONTRACTS_DB: 'test-db-id',
							},
						},
					},
				},
			},
		}
	},
)
