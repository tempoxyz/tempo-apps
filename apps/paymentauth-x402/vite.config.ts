import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	return {
		plugins: [cloudflare()],
		server: {
			port: Number(env.PORT ?? 3002),
		},
	}
})
