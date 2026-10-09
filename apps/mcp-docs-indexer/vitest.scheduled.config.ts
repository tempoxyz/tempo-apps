import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		include: ['test/scheduled.test.ts'],
	},
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './test/wrangler.jsonc' },
			main: './src/index.ts',
		}),
	],
})
