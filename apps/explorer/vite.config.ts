import { cloudflare } from '@cloudflare/vite-plugin'
import tailwind from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart as tanstack } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	return {
		plugins: [
			devtools(),
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
