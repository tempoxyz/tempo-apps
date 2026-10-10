import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import Icons from 'unplugin-icons/vite'

import wranglerJSON from '#wrangler.json' with { type: 'json' }
import { explorerZyzz } from './scripts/zyzz.ts'

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ['test/**/*.test.ts'],
		exclude: ['test/**/*.node.test.ts'],
	},
	plugins: [
		// Components under test author styles that only exist after compilation.
		...explorerZyzz({
			builtins: 'none',
			// Imports `cloudflare:workers`, which the Workers pool provides at
			// runtime but not to the compiler's import walk. Its styles live in
			// the sibling `-$hash.styles.ts`.
			exclude: ['src/routes/_layout/receipt/$hash.tsx'],
		}),
		Icons({ compiler: 'jsx', jsx: 'react' }),
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
