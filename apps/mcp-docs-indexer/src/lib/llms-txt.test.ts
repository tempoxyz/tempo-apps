import { describe, expect, it } from 'vitest'
import { parseLlmsTxt, toMarkdownUrl } from './llms-txt.js'

describe('parseLlmsTxt', () => {
	it('extracts absolute same-origin URLs', () => {
		const body = `
# Viem
- [Getting Started](https://viem.sh/docs/getting-started): intro
- [Clients](https://viem.sh/docs/clients): overview
`
		expect(parseLlmsTxt(body, 'https://viem.sh')).toEqual([
			'https://viem.sh/docs/getting-started',
			'https://viem.sh/docs/clients',
		])
	})

	it('resolves root-relative links against the base origin', () => {
		const body = '- [Foo](/foo)\n- [Bar](/nested/bar)'
		expect(parseLlmsTxt(body, 'https://wagmi.sh')).toEqual([
			'https://wagmi.sh/foo',
			'https://wagmi.sh/nested/bar',
		])
	})

	it('extracts bare markdown paths from bullet lists', () => {
		const body = `
- /index.md: Introduction
- /installation.md?ref=llms#setup: Installation
- /agents.txt: non-markdown alias
- /sitemap.xml: sitemap
`
		expect(parseLlmsTxt(body, 'https://regen.tempo.xyz')).toEqual([
			'https://regen.tempo.xyz/index.md',
			'https://regen.tempo.xyz/installation.md',
		])
	})

	it('extracts TIP pages from the tips.sh root index', () => {
		const body = `
- **TIP-0000**: TIP Process (Approved)
- **TIP-1026**: Token Logo URI (Approved)
- **TIP-1061-1**: Native Multisig Accounts (Draft)
`
		expect(parseLlmsTxt(body, 'https://tips.sh')).toEqual([
			'https://tips.sh/0000.md',
			'https://tips.sh/1026.md',
			'https://tips.sh/1061-1.md',
		])
	})

	it('drops off-origin links', () => {
		const body = '- [In](/in)\n- [Out](https://other.example.com/out)'
		expect(parseLlmsTxt(body, 'https://viem.sh')).toEqual([
			'https://viem.sh/in',
		])
	})

	it('strips fragments and query strings', () => {
		const body =
			'- [A](/a#section)\n- [B](/b?foo=bar)\n- [C](https://viem.sh/c?x=1#y)'
		expect(parseLlmsTxt(body, 'https://viem.sh')).toEqual([
			'https://viem.sh/a',
			'https://viem.sh/b',
			'https://viem.sh/c',
		])
	})

	it('deduplicates URLs that normalize to the same value', () => {
		const body = '- [A](/a)\n- [A again](https://viem.sh/a)\n- [B](/b)'
		expect(parseLlmsTxt(body, 'https://viem.sh')).toEqual([
			'https://viem.sh/a',
			'https://viem.sh/b',
		])
	})

	it('drops linked non-page file aliases', () => {
		const body =
			'- [Agent text](/agents.txt)\n- [Sitemap](/sitemap.xml)\n- [Page](/page)'
		expect(parseLlmsTxt(body, 'https://regen.tempo.xyz')).toEqual([
			'https://regen.tempo.xyz/page',
		])
	})

	it('ignores malformed parenthesized strings without crashing', () => {
		const body = '- [Bad](not a url)\n- [Good](/good)'
		expect(parseLlmsTxt(body, 'https://viem.sh')).toEqual([
			'https://viem.sh/good',
		])
	})

	it('returns an empty list for an empty body', () => {
		expect(parseLlmsTxt('', 'https://viem.sh')).toEqual([])
	})
})

describe('toMarkdownUrl', () => {
	it('appends .md to a plain path', () => {
		expect(toMarkdownUrl('https://viem.sh/docs/foo')).toBe(
			'https://viem.sh/docs/foo.md',
		)
	})

	it('strips a trailing slash before appending .md', () => {
		expect(toMarkdownUrl('https://viem.sh/docs/foo/')).toBe(
			'https://viem.sh/docs/foo.md',
		)
	})

	it('maps the root path to index.md', () => {
		expect(toMarkdownUrl('https://viem.sh/')).toBe('https://viem.sh/index.md')
	})

	it('does not append .md to a URL that already points at markdown', () => {
		expect(
			toMarkdownUrl('https://regen.tempo.xyz/installation.md?x=1#setup'),
		).toBe('https://regen.tempo.xyz/installation.md')
	})
})
