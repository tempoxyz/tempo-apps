import { cloudflare } from '@cloudflare/vite-plugin'
import tailwind from '@tailwindcss/vite'
import { tanstackStart as tanstack } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const requiredSecrets = ['INDEXSUPPLY_API_KEY']

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	if (requiredSecrets.some((secret) => !env[secret] || !process.env[secret]))
		throw new Error(`${requiredSecrets.join(', ')} are required`)

	return {
		plugins: [
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
		define: {
			'process.env.INDEXSUPPLY_API_KEY': JSON.stringify(
				env.INDEXSUPPLY_API_KEY || process.env.INDEXSUPPLY_API_KEY,
			),
		},
		build: {
			emptyOutDir: true,
			rolldownOptions: {
				output: {
					cleanDir: true,
				},
			},
		},
	}
})
