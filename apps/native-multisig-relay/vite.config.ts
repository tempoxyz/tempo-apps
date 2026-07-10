import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import { accountsAliases } from './config/accounts-aliases.js'

export default defineConfig({
	resolve: {
		alias: accountsAliases(),
		tsconfigPaths: true,
	},
	define: {
		__BUILD_VERSION__: JSON.stringify(
			(
				process.env.CF_PAGES_COMMIT_SHA ??
				process.env.GITHUB_SHA ??
				Date.now().toString()
			).slice(0, 8),
		),
	},
	plugins: [cloudflare()],
})
