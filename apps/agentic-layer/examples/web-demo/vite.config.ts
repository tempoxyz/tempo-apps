import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@tempo/402-sdk': path.resolve(
				__dirname,
				'../../packages/sdk/src/index.ts',
			),
			'@tempo/402-common': path.resolve(
				__dirname,
				'../../packages/common/src/index.ts',
			),
		},
	},
	define: {
		'process.env': {},
		global: 'window',
	},
	server: {
		port: 5173,
		proxy: {
			'/premium-data': {
				target: 'http://localhost:3000',
				changeOrigin: true,
			},
		},
	},
})
