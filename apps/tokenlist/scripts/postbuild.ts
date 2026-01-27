import { existsSync } from 'node:fs'
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const cwd = process.cwd()

try {
	// Copy data directory to dist
	const src = resolve(cwd, 'data')
	const dest = resolve(cwd, 'dist/tokenlist/data')

	if (existsSync(dest)) {
		await rm(dest, { recursive: true })
	}

	await cp(src, dest, { recursive: true })
	console.log('Copied data/ to dist/tokenlist/data/')

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
	}
} catch (error) {
	const errorMessage = error instanceof Error ? error.message : error
	console.error(errorMessage)
}
