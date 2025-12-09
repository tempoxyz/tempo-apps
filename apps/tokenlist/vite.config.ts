import { existsSync } from 'node:fs'
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import type { Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'

function copyAssetsPlugin(): Plugin {
	return {
		name: 'copy-assets',
		apply: 'build',
		enforce: 'post',
		async closeBundle() {
			const cwd = process.cwd()

			// Copy data directory to dist
			const src = resolve(cwd, 'data')
			const dest = resolve(cwd, 'dist/tokenlist/data')

			if (existsSync(dest)) {
				await rm(dest, { recursive: true })
			}

			await cp(src, dest, { recursive: true })
			console.log('Copied data/ to dist/tokenlist/data/')

			// Small delay to ensure Cloudflare plugin has finished writing
			await new Promise((r) => setTimeout(r, 100))

			// Patch wrangler.json to include assets config
			const wranglerPath = resolve(cwd, 'dist/tokenlist/wrangler.json')
			if (existsSync(wranglerPath)) {
				const wranglerJson = JSON.parse(
					await readFile(wranglerPath, 'utf-8'),
				) as Record<string, unknown>
				wranglerJson.assets = {
					directory: 'data',
					binding: 'ASSETS',
					run_worker_first: true,
				}
				await writeFile(wranglerPath, JSON.stringify(wranglerJson))
				console.log('Patched wrangler.json with assets config')
				// Verify the write
				const verifyContent = await readFile(wranglerPath, 'utf-8')
				console.log(
					'Verify assets in wrangler.json:',
					verifyContent.includes('"assets"'),
				)
			}
		},
	}
}

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	return {
		plugins: [cloudflare(), copyAssetsPlugin()],
		server: {
			port: Number(env.PORT ?? 3_000),
			allowedHosts: config.mode === 'development' ? true : undefined,
		},
	}
})
