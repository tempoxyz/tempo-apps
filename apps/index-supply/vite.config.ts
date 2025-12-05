import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [cloudflare()],
	server: {
		port: Number(process.env.PORT ?? 3_040),
	},
})
