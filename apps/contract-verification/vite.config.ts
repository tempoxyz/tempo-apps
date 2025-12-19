import NodeChildProcess from 'node:child_process'
import NodeProcess from 'node:process'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig, loadEnv } from 'vite'
import vitePluginChromiumDevTools from 'vite-plugin-devtools-json'

const commitSha =
	NodeChildProcess.execSync('git rev-parse --short HEAD').toString().trim() ||
	NodeProcess.env.CF_PAGES_COMMIT_SHA?.slice(0, 7)

const [, , , ...args] = NodeProcess.argv

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	const lastPort = (() => {
		const index = args.lastIndexOf('--port')
		return index === -1 ? null : (args.at(index + 1) ?? null)
	})()
	const port = Number(lastPort ?? env.PORT ?? 3_000)

	return {
		plugins: [cloudflare(), vitePluginChromiumDevTools()],
		server: {
			port,
			// https://hono.dev/docs/middleware/builtin/cors#using-with-vite
			cors: false,
			allowedHosts: config.mode === 'development' ? true : undefined,
		},
		define: {
			__BASE_URL__: JSON.stringify(
				config.mode === 'development'
					? `http://localhost:${port}`
					: (env.VITE_BASE_URL ?? ''),
			),
			__BUILD_VERSION__: JSON.stringify(commitSha ?? Date.now().toString()),
		},
		build: {
			copyPublicDir: true,
			rolldownOptions: {
				output: { minify: true },
			},
		},
	}
})
