import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: { include: ['test/**/*.test.ts'] },
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.json' },
			miniflare: {
				bindings: {
					ACCESS_KEYS_ACTIVE_KEY_ID: 'test',
					ACCESS_KEYS_ENCRYPTION_KEYS: JSON.stringify({
						test: btoa(
							String.fromCharCode(
								...crypto.getRandomValues(new Uint8Array(32)),
							),
						),
					}),
				},
			},
		}),
	],
})
