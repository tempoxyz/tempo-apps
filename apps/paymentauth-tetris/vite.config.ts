import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	return {
		plugins: [react(), cloudflare()],
		server: {
			port: Number(env.PORT ?? 3001),
		},
	}
})
