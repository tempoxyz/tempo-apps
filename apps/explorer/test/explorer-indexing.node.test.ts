import { describe, expect, it } from 'vitest'
import {
	EXPLORER_ORGANIZATION_ID,
	getCanonicalExplorerUrl,
	getExplorerHostPolicy,
	getExplorerWebApplication,
	isNonIndexableExplorerHost,
	withExplorerIndexingHeaders,
} from '#lib/explorer-indexing'

describe('Explorer host consolidation', () => {
	it.each([
		['explore.4217.tempo.xyz', 'explore.tempo.xyz'],
		['explore.mainnet.tempo.xyz', 'explore.tempo.xyz'],
		['explore.presto.tempo.xyz', 'explore.tempo.xyz'],
		['explore.42431.tempo.xyz', 'explore.testnet.tempo.xyz'],
		['explore.moderato.tempo.xyz', 'explore.testnet.tempo.xyz'],
	])('redirects %s to %s while preserving the resource URL', (from, to) => {
		expect(getExplorerHostPolicy(`https://${from}/tx/0x123?page=2`)).toEqual({
			type: 'redirect',
			location: `https://${to}/tx/0x123?page=2`,
		})
	})

	it('does not redirect either canonical host', () => {
		expect(getExplorerHostPolicy('https://explore.tempo.xyz/')).toBeUndefined()
		expect(
			getExplorerHostPolicy('https://explore.testnet.tempo.xyz/'),
		).toBeUndefined()
	})
})

describe('Explorer indexing controls', () => {
	it.each([
		'explore.31318.tempo.xyz',
		'explore.devnet.tempo.xyz',
		'explore.nextfork.devnet.tempo.xyz',
		'explorer-devnet.example.workers.dev',
		'explorer-nextfork.example.workers.dev',
	])('marks %s as non-indexable', (hostname) => {
		expect(isNonIndexableExplorerHost(hostname)).toBe(true)
	})

	it.each([
		'explore.tempo.xyz',
		'explore.testnet.tempo.xyz',
	])('keeps %s indexable', (hostname) => {
		expect(isNonIndexableExplorerHost(hostname)).toBe(false)
	})

	it('adds an X-Robots-Tag header to devnet responses', async () => {
		const response = withExplorerIndexingHeaders(
			'https://explore.devnet.tempo.xyz/blocks',
			new Response('ok', { headers: { 'Cache-Control': 'public' } }),
		)

		expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
		expect(response.headers.get('Cache-Control')).toBe('public')
		expect(await response.text()).toBe('ok')
	})
})

describe('Explorer metadata', () => {
	it('builds path-specific canonical URLs for public networks', () => {
		expect(getCanonicalExplorerUrl('mainnet', '/tokens')).toBe(
			'https://explore.tempo.xyz/tokens',
		)
		expect(getCanonicalExplorerUrl('testnet', '/token/0x123')).toBe(
			'https://explore.testnet.tempo.xyz/token/0x123',
		)
	})

	it('does not emit a canonical URL for development networks', () => {
		expect(getCanonicalExplorerUrl('devnet', '/')).toBeUndefined()
		expect(getCanonicalExplorerUrl('nextfork', '/')).toBeUndefined()
	})

	it('connects the Explorer application to the canonical Tempo organization', () => {
		expect(getExplorerWebApplication('mainnet')).toMatchObject({
			'@id': 'https://explore.tempo.xyz/#application',
			'@type': 'WebApplication',
			provider: { '@id': EXPLORER_ORGANIZATION_ID },
			url: 'https://explore.tempo.xyz/',
		})
	})
})
