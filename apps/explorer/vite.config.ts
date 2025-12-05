import { cloudflare } from '@cloudflare/vite-plugin'
import tailwind from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart as tanstack } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig, loadEnv } from 'vite'
import vitePluginChromiumDevTools from 'vite-plugin-devtools-json'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')
	const showDevtools = env.VITE_ENABLE_DEVTOOLS !== 'false'

	return {
		plugins: [
			showDevtools && devtools(),
			showDevtools && vitePluginChromiumDevTools(),
			cloudflare({ viteEnvironment: { name: 'ssr' } }),
			tsconfigPaths({
				projects: ['./tsconfig.json'],
			}),
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
		server: {
			port: Number(env.PORT ?? 3_000),
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
