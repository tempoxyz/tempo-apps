import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
		)
	})
	afterEach(() => vi.unstubAllGlobals())

	it.each([
		'',
		'.svg',
		'.png',
	])('serves API artwork for a mixed-case address with suffix %s', async (suffix) => {
		vi.mocked(fetch).mockResolvedValue(
			new Response('OUSD artwork', {
				headers: {
					'Content-Type': 'image/svg+xml',
					'Cache-Control': 'public, max-age=3600',
				},
			}),
		)
		const response = await app.request(
			`/icon/4217/0x20c0000000000000000000006a37DA5C996874BE${suffix}`,
			{},
			{},
		)
		expect(fetch).toHaveBeenCalledWith(
			'https://api.tempo.xyz/assets/4217/icons/0x20c0000000000000000000006a37da5c996874be',
		)
		expect(await response.text()).toBe('OUSD artwork')
		expect(response.headers.get('Content-Type')).toBe('image/svg+xml')
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
	})

	it.each([
		'error',
		'unavailable',
	])('keeps bundled artwork when the API is %s', async (failure) => {
		if (failure === 'error')
			vi.mocked(fetch).mockRejectedValue(new Error('offline'))
		else vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))
		const response = await app.request(
			'/icon/4217/0x20c0000000000000000000000000000000000000.svg',
			{},
			{
				ASSETS: createAssets({
					'/4217/icons/0x20c0000000000000000000000000000000000000.svg': {
						body: 'bundled artwork',
					},
				}),
			},
		)
		expect(await response.text()).toBe('bundled artwork')
	})

	it('keeps named icons local', async () => {
		const response = await app.request(
			'/icon/4217/usd.svg',
			{},
			{
				ASSETS: createAssets({
					'/4217/icons/usd.svg': { body: 'USD artwork' },
				}),
			},
		)
		expect(await response.text()).toBe('USD artwork')
		expect(fetch).not.toHaveBeenCalled()
	})

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
