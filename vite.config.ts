import { cloudflare } from '@cloudflare/vite-plugin'
import tailwind from '@tailwindcss/vite'
import { tanstackStart as tanstack } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	plugins: [
		cloudflare({ viteEnvironment: { name: 'ssr' } }),
		tsconfigPaths({
			projects: ['./tsconfig.json'],
		}),
		tailwind(),
		tanstack({
			srcDirectory: './src',
			start: { entry: './src/start.ts' },
			server: { entry: './src/server.ts' },
			client: { entry: './src/client.tsx' },
		}),
		react(),
	],
})
