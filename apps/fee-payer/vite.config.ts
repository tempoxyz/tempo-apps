import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
	resolve: {
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
