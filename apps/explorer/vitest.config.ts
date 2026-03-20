import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

import wranglerJSON from '#wrangler.json' with { type: 'json' }

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ['test/**/*.test.ts'],
	},
	plugins: [
		cloudflareTest({
			miniflare: {
				compatibilityFlags: [
					...wranglerJSON.compatibility_flags,
					'enable_nodejs_fs_module',
					'enable_nodejs_v8_module',
					'enable_nodejs_tty_module',
					'enable_nodejs_process_v2',
					'enable_nodejs_http_modules',
					'enable_nodejs_perf_hooks_module',
				],
			},
			wrangler: {
				configPath: './wrangler.json',
			},
		}),
	],
})
