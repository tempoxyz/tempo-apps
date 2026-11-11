import { join } from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

import wranglerJSON from '#wrangler.json' with { type: 'json' }

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		testTimeout: 10_000,
		include: ['**/*.test.ts'],
	},
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: join(import.meta.dirname, './wrangler.json'),
			},
			miniflare: {
				compatibilityFlags: wranglerJSON.compatibility_flags,
				bindings: {
					TEMPO_ENV: 'moderato',
				},
			},
		}),
	],
})
