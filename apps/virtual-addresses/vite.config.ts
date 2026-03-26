import { cloudflare } from '@cloudflare/vite-plugin'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	resolve: {
		alias: {
			'#': './src',
		},
	},
	plugins: [
		cloudflare({ viteEnvironment: { name: 'ssr' } }),
		tailwind(),
		Icons({ compiler: 'jsx', jsx: 'react' }),
		react(),
	],
	worker: {
		format: 'es',
	},
	build: {
		minify: 'oxc',
	},
	server: {
		proxy: {
			'/rpc': {
				target: 'http://localhost:8545',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/rpc/, ''),
			},
		},
	},
})
