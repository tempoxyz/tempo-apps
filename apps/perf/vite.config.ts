import { cloudflare } from '@cloudflare/vite-plugin'
import tailwind from '@tailwindcss/vite'
import { tanstackStart as tanstack } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
		alias: {
			'#': './src',
			'#wrangler.json': './wrangler.json',
		},
	},
	plugins: [
		cloudflare({ viteEnvironment: { name: 'ssr' } }),
		tailwind(),
		Icons({ compiler: 'jsx', jsx: 'react' }),
		tanstack({
			srcDirectory: './src',
			start: { entry: './src/index.start.ts' },
			server: { entry: './src/index.server.ts' },
			client: { entry: './src/index.client.tsx' },
		}),
		react(),
	],
	server: {
		port: 3001,
		watch: { ignored: ['**/routeTree.gen.ts'] },
	},
	build: { minify: 'oxc' },
})
