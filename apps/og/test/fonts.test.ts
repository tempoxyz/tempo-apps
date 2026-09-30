import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadFonts } from '../src/utilities.ts'

test('fonts use bundled assets, retry failures, and share successful loads', async () => {
	let fail = true
	const paths: string[] = []
	const env = {
		ASSETS: {
			fetch: async (request: Request) => {
				paths.push(new URL(request.url).pathname)
				return fail
					? new Response(null, { status: 503 })
					: new Response('font bytes')
			},
		},
	} as unknown as Cloudflare.Env
	await assert.rejects(loadFonts(env), /Failed to load font .*: 503/)
	fail = false
	const [first, second] = await Promise.all([loadFonts(env), loadFonts(env)])
	assert.equal(first, second)
	assert.equal(await loadFonts(env), first)
	assert.equal(paths.length, 8)
	assert.deepEqual(paths.slice(4), [
		'/fonts/Pilat-Regular.woff2',
		'/fonts/Pilat-Demi.woff2',
		'/fonts/Pilat-Demi.woff2',
		'/fonts/JetBrainsMono-Light.woff2',
	])
})
