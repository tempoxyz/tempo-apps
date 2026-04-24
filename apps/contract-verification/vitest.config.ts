import path from 'node:path'
import {
	cloudflareTest,
	readD1Migrations,
} from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

import { counterFixture } from './test/fixtures/counter.fixture.ts'

export default defineConfig(async () => {
	const migrationsPath = path.join(import.meta.dirname, 'database/drizzle')
	const migrations = await readD1Migrations(migrationsPath)

	return {
		test: {
			exclude: ['**/_/**'],
			include: ['test/**/*.test.ts'],
			setupFiles: ['./test/setup.ts'],
		},
		plugins: [
			cloudflareTest({
				wrangler: {
					configPath: './wrangler.json',
				},
				main: './src/index.tsx',
				miniflare: {
					compatibilityFlags: ['service_binding_extra_handlers'],
					bindings: {
						NODE_ENV: 'test',
						BUN_VERSION: '1.3.8',
						TEST_MIGRATIONS: migrations,
						WHITELISTED_ORIGINS: 'http://localhost',
						TEST_COMPILER_RESPONSE: JSON.stringify(counterFixture.solcOutput),
					},
				},
			}),
		],
	}
})
