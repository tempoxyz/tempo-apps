import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MARKDOWN_ACCEPT } from './markdown.js'
import { handleMcp } from './mcp.js'
import type { Source } from './sources.js'

// Search looks up docs sections in source indexes; keep tests off the network
// unless they stub the responses they need.
beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('not found', { status: 404 })),
	)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

function instance(
	search: (params: AiSearchSearchRequest) => Promise<AiSearchSearchResponse>,
) {
	return { search } as unknown as AiSearchInstance
}

const emptyInstance = instance(async () => ({ search_query: '', chunks: [] }))

async function callTool(
	name: string,
	args: Record<string, unknown>,
	context: { instance: AiSearchInstance; sources: Source[] },
) {
	const res = await handleMcp(
		new Request('https://mcp.tempo.xyz/', {
			method: 'POST',
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name, arguments: { ...args, response_format: 'structured' } },
			}),
		}),
		context,
	)
	const body = await res.json()
	return body.result as {
		isError?: boolean
		content: { text: string }[]
		structuredContent?: { result: Record<string, unknown> }
	}
}

async function pageTitles(source: Source, query: string) {
	const result = await callTool(
		'find_pages',
		{ source: source.id, query },
		{ instance: emptyInstance, sources: [source] },
	)
	const pages = result.structuredContent?.result.pages as { title: string }[]
	return pages.map((page) => page.title)
}

describe('find_pages ranking', () => {
	const base = 'https://tempo.xyz/developers'
	const source: Source = { id: 'ranking-tempo', base }
	const index = [
		`- [Access keys](${base}/docs/accounts/access-keys.md): Delegate signing with limits`,
		`- [Rapid settlement](${base}/docs/guide/settlement.md): Settle quickly`,
		`- [How to create and manage API keys](${base}/docs/api/console/api-keys.md): Create project-scoped keys`,
		`- [API Keys](${base}/docs/api/api-keys.md): Credentials for accessing the Tempo API.`,
		`- [MCP](${base}/docs/api/mcp.md): A hosted Model Context Protocol server`,
		`- [TIP-20 Tokens](${base}/docs/protocol/tip20/overview.md): Token standard`,
		`- [T11 Network Upgrade](${base}/docs/protocol/upgrades/t11.md): Upgrade notes`,
		`- [T12 Network Upgrade](${base}/docs/protocol/upgrades/t12.md): Upgrade notes`,
	].join('\n')

	it.each([
		['API keys', 'API Keys'],
		['MCP', 'MCP'],
		['TIP-20', 'TIP-20 Tokens'],
		['T12 network upgrade', 'T12 Network Upgrade'],
		['Tempo API', 'API Keys'],
	])('ranks %s first as %s', async (query, title) => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(index)),
		)

		const titles = await pageTitles(source, query)

		expect(titles[0]).toBe(title)
		expect(titles).not.toContain('Rapid settlement')
	})

	it('matches whole words, including camelCase parts', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						[
							`- [Learn the basics](${base}/docs/basics.md): Start here`,
							`- [Integrate Tempo](${base}/docs/integrate.md): Connect your app`,
							`- [Rate limits](${base}/docs/api/rate-limits.md): Request quotas`,
							`- [useConnect](${base}/docs/hooks/useConnect.md): Hook`,
						].join('\n'),
					),
			),
		)
		const words: Source = { id: 'ranking-words', base }

		expect(await pageTitles(words, 'earn')).toEqual([])
		expect(await pageTitles(words, 'rate limits')).toEqual(['Rate limits'])
		expect(await pageTitles(words, 'connect')).toEqual([
			'useConnect',
			'Integrate Tempo',
		])
	})

	it('reads tips.sh proposal lines', async () => {
		const tips: Source = {
			id: 'ranking-tips',
			base: 'https://tips.example',
			indexPath: '/',
		}
		const fetcher = vi.fn(
			async (_url: string, _init?: RequestInit) =>
				new Response(
					[
						'# Tempo Improvement Proposals',
						'',
						'- **TIP-1000**: State Creation Cost Increase (Mainnet)',
						'- **TIP-1000-1**: State Creation Cost Increase (Mainnet)',
						'- **TIP-1004**: Permit for TIP-20 (Mainnet)',
					].join('\n'),
				),
		)
		vi.stubGlobal('fetch', fetcher)

		const result = await callTool(
			'find_pages',
			{ source: tips.id, query: 'state creation cost' },
			{ instance: emptyInstance, sources: [tips] },
		)

		expect(result.structuredContent?.result.pages).toEqual([
			{
				title: 'TIP-1000: State Creation Cost Increase (Mainnet)',
				url: 'https://tips.example/1000',
				score: expect.any(Number),
			},
		])
		// tips.sh returns HTML unless the client asks for Markdown.
		expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
			accept: MARKDOWN_ACCEPT,
		})
	})
})

describe('search source inference', () => {
	const sources: Source[] = ['tempo', 'viem', 'vocs', 'mpp'].map((id) => ({
		id,
		base: `https://${id}.example`,
	}))

	it.each([
		['How do I install the Tempo MCP server in Claude Code?', undefined],
		['How do I accept machine payments on Tempo?', undefined],
		['How do MPP sessions work?', { source: 'mpp' }],
		['permit2 signing with viem on tempo', { source: 'viem' }],
		['How do virtual addresses work for TIP-20 deposits?', { source: 'tempo' }],
	])('routes %s', async (query, filters) => {
		let seen: AiSearchSearchRequest | undefined
		await callTool(
			'search',
			{ query },
			{
				instance: instance(async (params) => {
					seen = params
					return {
						search_query: query,
						chunks: [
							{
								id: '1',
								type: 'text',
								score: 0.9,
								text: 'docs',
								item: {
									key: `${filters?.source ?? 'tempo'}/page.md`,
									metadata: { source: filters?.source ?? 'tempo' },
								},
							},
						],
					}
				}),
				sources,
			},
		)

		expect(seen?.ai_search_options?.retrieval?.filters).toEqual(filters)
	})
})

describe('search options', () => {
	it('keeps reranking, rewriting, and result limits server-owned', async () => {
		let seen: AiSearchSearchRequest | undefined
		const result = await callTool(
			'search',
			{
				query: 'server owned retrieval options',
				ai_search_options: {
					reranking: { enabled: false },
					query_rewrite: { enabled: true },
					retrieval: { max_num_results: 500, fusion_method: 'max' },
					model: 'expensive',
				},
			},
			{
				instance: instance(async (params) => {
					seen = params
					return {
						search_query: 'server owned retrieval options',
						chunks: [
							{
								id: '1',
								type: 'text',
								score: 0.9,
								text: 'Retrieval options',
								item: { key: 'viem/options.md' },
							},
						],
					}
				}),
				sources: [{ id: 'viem', base: 'https://viem.sh' }],
			},
		)

		expect(seen?.ai_search_options).toEqual({
			retrieval: {
				retrieval_type: 'hybrid',
				keyword_match_mode: 'or',
				max_num_results: 50,
				match_threshold: 0.3,
				context_expansion: 0,
			},
			reranking: { enabled: true, match_threshold: 0.2 },
			query_rewrite: { enabled: false },
			cache: { enabled: true, cache_threshold: 'close_enough' },
		})
		expect(result.structuredContent?.result.retrieval).toBe('ai_search')
	})

	it('reports when no retrieval path found anything', async () => {
		const result = await callTool(
			'search',
			{ query: 'nothing matches this query' },
			{
				instance: emptyInstance,
				sources: [{ id: 'viem', base: 'https://viem.sh' }],
			},
		)

		expect(result.structuredContent?.result).toMatchObject({
			retrieval: 'none',
			chunks: [],
		})
	})
})

describe('read_page cleanup', () => {
	it('strips generated agent notices from Tempo pages', async () => {
		const source: Source = {
			id: 'read-tempo',
			base: 'https://tempo.xyz/developers',
		}
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						[
							'<!-- tempo-docs-context -->',
							'> Source: [/docs/api/mcp](https://tempo.xyz/developers/docs/api/mcp.md)',
							'',
							'> Tempo MCP: Use `search` at `https://mcp.tempo.xyz`.',
							'',
							'# MCP',
							'',
							'Hosted MCP server.',
						].join('\n'),
					),
			),
		)

		const result = await callTool(
			'read_page',
			{ source: source.id, path: '/docs/api/mcp' },
			{ instance: emptyInstance, sources: [source] },
		)

		expect(result.structuredContent?.result.text).toBe(
			'# MCP\n\nHosted MCP server.',
		)
	})

	it('reports HTML responses as unavailable Markdown', async () => {
		const source: Source = { id: 'read-html', base: 'https://tips.example' }
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response('<!DOCTYPE html><html></html>', {
						headers: { 'content-type': 'text/html' },
					}),
			),
		)

		const result = await callTool(
			'read_page',
			{ source: source.id, path: '/1000-1' },
			{ instance: emptyInstance, sources: [source] },
		)

		expect(result.isError).toBe(true)
		expect(JSON.parse(result.content[0].text).error).toBe(
			'page is HTML, not Markdown',
		)
	})

	it('reads the root of a prefixed source from index.md', async () => {
		const source: Source = {
			id: 'read-root',
			base: 'https://tempo.xyz/developers',
		}
		const fetcher = vi.fn(async () => new Response('# Tempo Docs'))
		vi.stubGlobal('fetch', fetcher)

		const result = await callTool(
			'read_page',
			{ source: source.id, path: '/', max_chars: '400' },
			{ instance: emptyInstance, sources: [source] },
		)

		expect(fetcher.mock.calls[0]?.[0]).toBe(
			'https://tempo.xyz/developers/index.md',
		)
		expect(result.structuredContent?.result.text).toBe('# Tempo Docs')
	})

	it('explains when a URL is outside the source', async () => {
		const result = await callTool(
			'read_page',
			{ source: 'read-scope', url: 'https://tempo.xyz/blog' },
			{
				instance: emptyInstance,
				sources: [{ id: 'read-scope', base: 'https://tempo.xyz/developers' }],
			},
		)

		expect(JSON.parse(result.content[0].text).error).toBe(
			'url must be a page under https://tempo.xyz/developers',
		)
	})
})

describe('source index resource', () => {
	it('says when the page index is truncated', async () => {
		const source: Source = { id: 'big-index', base: 'https://big.example' }
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						Array.from(
							{ length: 501 },
							(_, index) => `- [Page ${index}](/page-${index})`,
						).join('\n'),
					),
			),
		)

		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'resources/read',
					params: { uri: 'tempo-docs://source/big-index/index' },
				}),
			}),
			{ instance: emptyInstance, sources: [source] },
		)

		const text = (await res.json()).result.contents[0].text as string
		expect(text).toContain('- [Page 499](https://big.example/page-499)')
		expect(text).not.toContain('- [Page 500]')
		expect(text).toContain('Showing 500 of 501 pages.')
	})
})

describe('docs sections', () => {
	const base = 'https://tempo.xyz/developers'
	const index = [
		'# Tempo Docs',
		'',
		'## Accounts',
		'',
		`- [Create an account](${base}/docs/accounts/create.md): Create accounts`,
		'',
		'## Zones',
		'',
		`- [Zones](${base}/docs/zones.md): Private balances`,
		'',
		'### Earlier testnet sandbox',
		'',
		`- [Send tokens within a zone](${base}/docs/guide/private-zones/send.md): Sandbox`,
	].join('\n')

	function stubIndex(body = index) {
		const fetcher = vi.fn(async (url: string) =>
			url.endsWith('llms.txt')
				? new Response(body)
				: new Response('not found', { status: 404 }),
		)
		vi.stubGlobal('fetch', fetcher)
		return fetcher
	}

	it('returns the docs section with page candidates', async () => {
		stubIndex()
		const source: Source = { id: 'sections-find', base }

		const result = await callTool(
			'find_pages',
			{ source: source.id, query: 'send tokens zone' },
			{ instance: emptyInstance, sources: [source] },
		)

		expect(result.structuredContent?.result.pages).toContainEqual({
			title: 'Send tokens within a zone',
			url: `${base}/docs/guide/private-zones/send`,
			section: 'Zones / Earlier testnet sandbox',
			score: expect.any(Number),
		})
	})

	it('prefers pages in a section the query names', async () => {
		stubIndex(
			[
				'## Earn',
				`- [Vaults](${base}/docs/earn/vaults.md): Choose an Earn vault`,
				'## APIs & SDKs',
				`- [Earn](${base}/docs/api/earn.md): Vaults that earn yield`,
			].join('\n'),
		)
		const source: Source = { id: 'sections-boost', base }

		const titles = await pageTitles(source, 'Earn vault')

		expect(titles).toEqual(['Vaults', 'Earn'])
	})

	it('ignores table-of-contents wrapper headings', async () => {
		stubIndex(
			[
				'## Table of Contents',
				'### Guides',
				'- [Connect Wallet](/react/guides/connect-wallet): Connect',
			].join('\n'),
		)
		const source: Source = { id: 'sections-toc', base: 'https://wagmi.example' }

		const result = await callTool(
			'find_pages',
			{ source: source.id, query: 'connect wallet' },
			{ instance: emptyInstance, sources: [source] },
		)

		const [page] = result.structuredContent?.result.pages as {
			section?: string
		}[]
		expect(page?.section).toBe('Guides')
	})

	it('labels crawled search results with their source and section', async () => {
		stubIndex()
		const source: Source = { id: 'sections-search', base }

		const result = await callTool(
			'search',
			{ query: 'create an account section lookup' },
			{
				instance: instance(async () => ({
					search_query: 'create an account section lookup',
					chunks: [
						{
							id: '1',
							type: 'text',
							score: 0.9,
							text: 'Create accounts',
							item: { key: `${base}/docs/accounts/create/` },
						},
					],
				})),
				sources: [source],
			},
		)

		expect(result.structuredContent?.result.chunks).toEqual([
			{
				score: 0.9,
				url: `${base}/docs/accounts/create`,
				text: 'Create accounts',
				source: 'sections-search',
				section: 'Accounts',
			},
		])
	})

	it('groups the page index resource by section', async () => {
		stubIndex()
		const source: Source = { id: 'sections-resource', base }

		const read = async (uri: string) => {
			const res = await handleMcp(
				new Request('https://mcp.tempo.xyz/', {
					method: 'POST',
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						method: 'resources/read',
						params: { uri },
					}),
				}),
				{ instance: emptyInstance, sources: [source] },
			)
			return (await res.json()).result.contents[0].text as string
		}

		expect(await read('tempo-docs://source/sections-resource/index')).toBe(
			[
				'# sections-resource docs page index',
				'## Accounts',
				`- [Create an account](${base}/docs/accounts/create)`,
				'',
				'## Zones',
				`- [Zones](${base}/docs/zones)`,
				'',
				'## Zones / Earlier testnet sandbox',
				`- [Send tokens within a zone](${base}/docs/guide/private-zones/send)`,
			].join('\n'),
		)
		expect(await read('tempo-docs://source/sections-resource')).toContain(
			'Sections: Accounts, Zones, Zones / Earlier testnet sandbox',
		)
	})
})
