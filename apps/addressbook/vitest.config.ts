import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
	},
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: './wrangler.json',
			},
			miniflare: {
				bindings: {
					ALLOWED_ORIGINS: '*',
				},
				kvNamespaces: ['ADDRESSBOOK'],
			},
		}),
	],
})
