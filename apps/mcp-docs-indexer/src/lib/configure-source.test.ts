import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const argv = process.argv
beforeEach(() => {
	vi.resetModules()
	vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test-account')
	vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-token')
	vi.spyOn(console, 'info').mockImplementation(() => {})
	process.argv = ['node', 'configure-ai-search-source.ts']
})
afterEach(() => {
	process.argv = argv
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('crawler source configuration', () => {
	it.each([false, true])('only writes when apply=%s', async (apply) => {
		if (apply) process.argv.push('--apply')
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					success: true,
					result: {
						type: 'web-crawler',
						source_params: {
							r2_jurisdiction: 'default',
							web_crawler: {
								discover_options: { include_external_links: false },
								parse_options: { include_images: false },
							},
						},
					},
				}),
			)
			.mockResolvedValueOnce(Response.json({ success: true }))
		vi.stubGlobal('fetch', fetchMock)
		await import('../../scripts/configure-ai-search-source.js')
		expect(fetchMock).toHaveBeenCalledTimes(apply ? 2 : 1)
		if (apply)
			expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
				source: 'tempo.xyz',
				source_params: {
					r2_jurisdiction: 'default',
					include_items: [
						'https://tempo.xyz/developers',
						'https://tempo.xyz/developers/**',
					],
					web_crawler: {
						discover_options: { include_external_links: false },
						parse_type: 'sitemap',
						parse_options: {
							include_images: false,
							specific_sitemaps: ['https://tempo.xyz/developers/sitemap.xml'],
						},
					},
				},
			})
		expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
			'test-token',
		)
	})
	it('rejects an instance of another type without writing', async () => {
		process.argv.push('--apply')
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				Response.json({ success: true, result: { type: 'r2' } }),
			)
		vi.stubGlobal('fetch', fetchMock)
		await expect(
			import('../../scripts/configure-ai-search-source.js'),
		).rejects.toThrow('Expected a web-crawler instance')
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})
})
