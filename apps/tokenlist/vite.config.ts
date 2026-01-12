import NodeFS from 'node:fs/promises'
import NodePath from 'node:path'
import NodeChildProcess from 'node:child_process'
import NodeProcess from 'node:process'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const exists = async (path: string) =>
	NodeFS.stat(path)
		.then(() => true)
		.catch(() => false)

const commitSha =
	NodeChildProcess.execSync('git rev-parse --short HEAD').toString().trim() ||
	NodeProcess.env.CF_PAGES_COMMIT_SHA?.slice(0, 7)

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	return {
		plugins: [cloudflare(), copyAssetsPlugin()],
		define: {
			__BUILD_VERSION__: JSON.stringify(commitSha ?? Date.now().toString()),
		},
		// Serve files from 'data' directory as static assets in dev mode
		// This matches wrangler.jsonc's assets.directory setting
		publicDir: 'data',
		server: {
			port: Number(env.PORT ?? 3_000),
			allowedHosts: config.mode === 'development' ? true : undefined,
		},
	}
})

function copyAssetsPlugin(): Plugin {
	return {
		name: 'copy-assets',
		apply: 'build',
		enforce: 'post',
		async closeBundle() {
			const cwd = process.cwd()

			// Copy data directory to dist
			const src = NodePath.resolve(cwd, 'data')
			const dest = NodePath.resolve(cwd, 'dist/tokenlist/data')

			if (await exists(dest)) await NodeFS.rm(dest, { recursive: true })

			await NodeFS.cp(src, dest, { recursive: true })
			console.log('Copied data/ to dist/tokenlist/data/')

			// Small delay to ensure Cloudflare plugin has finished writing
			await new Promise((r) => setTimeout(r, 100))

			// Patch wrangler.json to include assets config
			const wranglerPath = NodePath.resolve(cwd, 'dist/tokenlist/wrangler.json')
			if (await exists(wranglerPath)) {
				const wranglerJson = JSON.parse(
					await NodeFS.readFile(wranglerPath, 'utf-8'),
				) as Record<string, unknown>
				wranglerJson.assets = {
					directory: 'data',
					binding: 'ASSETS',
					run_worker_first: true,
				}
				await NodeFS.writeFile(wranglerPath, JSON.stringify(wranglerJson))
				console.info('Patched wrangler.json with assets config')
				// Verify the write
				const verifyContent = await NodeFS.readFile(wranglerPath, 'utf-8')
				console.info(
					'Verify assets in wrangler.json:',
					verifyContent.includes('"assets"'),
				)
			}
		},
	}
}
