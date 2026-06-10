import { describe, expect, it } from 'vitest'
import app from '../src/index.tsx'

type Asset = {
	body: string
	contentType?: string | undefined
}

function createAssets(files: Record<string, Asset>): Fetcher {
	return {
		fetch: async (input) => {
			const url = new URL(input.toString())
			const asset = files[url.pathname]
			if (!asset) return new Response('not found', { status: 404 })

			const headers = new Headers()
			if (asset.contentType) headers.set('Content-Type', asset.contentType)

			return new Response(asset.body, { headers })
		},
	} satisfies Fetcher
}

describe('token icon route', () => {
	it('serves a PNG icon when the token has no SVG asset', async () => {
		const response = await app.request(
			'/icon/4217/0x20c000000000000000000000f047dd7018e50367',
			{},
			{
				ASSETS: createAssets({
					'/4217/icons/0x20c000000000000000000000f047dd7018e50367.png': {
						body: 'png icon',
						contentType: 'image/png',
					},
					'/4217/icons/fallback.svg': {
						body: 'fallback icon',
						contentType: 'image/svg+xml',
					},
				}),
			},
		)

		await expect(response.text()).resolves.toBe('png icon')
		expect(response.headers.get('Content-Type')).toBe('image/png')
	})

	it('falls back to the default SVG when no token icon exists', async () => {
		const response = await app.request(
			'/icon/4217/0x20c000000000000000000000000000000000dead',
			{},
			{
				ASSETS: createAssets({
					'/4217/icons/fallback.svg': {
						body: 'fallback icon',
						contentType: 'image/svg+xml',
					},
				}),
			},
		)

		await expect(response.text()).resolves.toBe('fallback icon')
		expect(response.headers.get('Content-Type')).toBe('image/svg+xml')
	})
})
