import { expect, it } from 'vitest'

// Run against the actual Explorer and OG workers, without browser hydration:
// EXPLORER_TEST_ORIGIN=http://localhost:3000 OG_TEST_ORIGIN=http://localhost:8787
// pnpm exec vitest run --config vitest.node.config.ts test/social-card.e2e.node.test.ts
it.skipIf(!process.env.EXPLORER_TEST_ORIGIN)(
	'serves accurate Zone Portal metadata and a renderable social image',
	async () => {
		const response = await fetch(
			new URL(
				'/address/0x5ad0000000000000000000000000000000000001?tab=batches',
				process.env.EXPLORER_TEST_ORIGIN,
			),
			{
				headers: {
					'user-agent':
						'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
				},
			},
		)
		expect(response.status).toBe(200)
		const html = await response.text()
		const images = [
			...html.matchAll(/<meta property="og:image" content="([^"]+)"/g),
		]
		expect(images).toHaveLength(1)
		expect(html).toContain('content="Zone Portal Proxy #1 ⋅ Tempo Explorer"')
		expect(html).toContain('deposits, withdrawals, batches, and token balances')
		const imageContent = images[0]?.[1]
		if (!imageContent) throw new Error('Missing OG image metadata')
		const imageUrl = new URL(imageContent.replaceAll('&amp;', '&'))
		expect(imageUrl.searchParams.has('txCount')).toBe(false)
		expect(imageUrl.searchParams.has('holdings')).toBe(false)
		expect(imageUrl.pathname).toBe(
			'/zone-portal/0x5ad0000000000000000000000000000000000001',
		)
		expect(imageUrl.searchParams.get('network')).toBe('mainnet')
		const target = process.env.OG_TEST_ORIGIN
			? new URL(imageUrl.pathname + imageUrl.search, process.env.OG_TEST_ORIGIN)
			: imageUrl
		const image = await fetch(target)
		expect(image.status).toBe(200)
		expect(image.headers.get('x-portal-data')).toBe('available')
		expect(image.headers.get('content-type')).toBe('image/webp')
		const bytes = new Uint8Array(await image.arrayBuffer())
		expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF')
		expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WEBP')
		expect(bytes.length).toBeGreaterThan(1000)
	},
	60_000,
)
