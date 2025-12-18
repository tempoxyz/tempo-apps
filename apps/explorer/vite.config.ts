import path from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwind from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart as tanstack } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig, loadEnv } from 'vite'
import vitePluginChromiumDevTools from 'vite-plugin-devtools-json'

const [, , , ...args] = process.argv

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')
	const showDevtools = env.VITE_ENABLE_DEVTOOLS !== 'false'

	const lastPort = (() => {
		const index = args.lastIndexOf('--port')
		return index === -1 ? null : (args.at(index + 1) ?? null)
	})()
	const port = Number(lastPort ?? env.PORT ?? 3_000)

	return {
		define: {
			__BASE_URL__: JSON.stringify(
				config.mode === 'development'
					? `http://localhost:${port}`
					: (env.VITE_BASE_URL ?? ''),
			),
			__BUILD_VERSION__: JSON.stringify(
				env.CF_PAGES_COMMIT_SHA?.slice(0, 8) ?? Date.now().toString(),
			),
		},
		plugins: [
			showDevtools && devtools(),
			showDevtools && vitePluginChromiumDevTools(),
			config.mode === 'production' &&
				sentryVitePlugin({
					org: 'tempoxyz',
					telemetry: false,
					project: 'tempo-explorer',
					authToken: env.SENTRY_AUTH_TOKEN,
				}),
			cloudflare({ viteEnvironment: { name: 'ssr' } }),
			tailwind(),
			Icons({
				compiler: 'jsx',
				jsx: 'react',
			}),
			tanstack({
				srcDirectory: './src',
				start: { entry: './src/index.start.ts' },
				server: { entry: './src/index.server.ts' },
				client: { entry: './src/index.client.tsx' },
			}),
			react(),
		],
		resolve: {
			alias: [
				{
					find: /^#(?!tanstack)(.*)/,
					replacement: path.resolve(__dirname, './src/$1'),
				},
			],
		},
		server: {
			port,
			allowedHosts: config.mode === 'development' ? true : undefined,
		},
		build: {
			rolldownOptions: {
				output: {
					minify: {
						compress:
							config.mode === 'production'
								? { dropConsole: true, dropDebugger: true }
								: undefined,
					},
				},
			},
		},
	}
})
