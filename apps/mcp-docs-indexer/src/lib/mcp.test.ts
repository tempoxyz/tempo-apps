import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleMcp } from './mcp.js'
import { captureMcpAnalytics, parseJsonRpcRequest } from './posthog-mcp.js'
import type { Source } from './sources.js'

function instance(
	search: (params: AiSearchSearchRequest) => Promise<AiSearchSearchResponse>,
) {
	return { search } as unknown as AiSearchInstance
}

const sources: Source[] = [
	{
		id: 'viem',
		base: 'https://viem.sh',
		description: 'TypeScript interface for Ethereum / Tempo',
	},
	{
		id: 'wagmi',
		base: 'https://wagmi.sh',
		description: 'React Hooks for Ethereum / Tempo',
	},
]

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('handleMcp', () => {
	it('serves compact search and page read tool schemas', async () => {
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/list',
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources,
			},
		)

		expect(res).toBeDefined()
		const body = await res?.json()
		expect(body.result.tools).toHaveLength(3)
		expect(body.result.tools[0].name).toBe('search')
		expect(body.result.tools[0].inputSchema.properties.source.enum).toEqual([
			'viem',
			'wagmi',
		])
		expect(body.result.tools[0].inputSchema.properties.max_results.type).toBe(
			'number',
		)
		expect(
			body.result.tools[0].inputSchema.properties.max_chars_per_chunk.type,
		).toBe('number')
		expect(body.result.tools[1].name).toBe('find_pages')
		expect(body.result.tools[1].inputSchema.properties.source.enum).toEqual([
			'viem',
			'wagmi',
		])
		expect(body.result.tools[2].name).toBe('read_page')
		expect(body.result.tools[2].inputSchema.properties.source.enum).toEqual([
			'viem',
			'wagmi',
		])
	})

	it('normalizes simple source and result controls into retrieval options', async () => {
		let seen: AiSearchSearchRequest | undefined
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				headers: { accept: 'application/json, text/event-stream' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 2,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'tempo wallet connector',
							source: 'wagmi',
							max_results: 3,
							ai_search_options: {
								ranking_options: { score_threshold: 0.6 },
							},
						},
					},
				}),
			}),
			{
				instance: instance(async (params) => {
					seen = params
					return {
						search_query: 'tempo wallet connector',
						chunks: [
							{
								id: '1',
								type: 'text',
								score: 1,
								text: 'wagmi docs',
								item: { key: 'wagmi/docs_wallet' },
							},
						],
					}
				}),
				sources,
			},
		)

		expect(res).toBeDefined()
		expect(seen?.ai_search_options?.retrieval).toMatchObject({
			retrieval_type: 'hybrid',
			keyword_match_mode: 'or',
			max_num_results: 3,
			match_threshold: 0.6,
			context_expansion: 0,
			filters: { source: 'wagmi' },
		})
		expect(seen?.ai_search_options?.cache).toEqual({
			enabled: true,
			cache_threshold: 'close_enough',
		})
	})

	it('infers a source filter for unfiltered source-specific queries', async () => {
		let seen: AiSearchSearchRequest | undefined
		await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 21,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'unique virtual addresses TIP-20 deposit question',
							max_results: 4,
						},
					},
				}),
			}),
			{
				instance: instance(async (params) => {
					seen = params
					return {
						search_query: 'unique virtual addresses TIP-20 deposit question',
						chunks: [
							{
								id: '1',
								type: 'text',
								score: 1,
								text: 'tempo virtual address docs',
								item: { key: 'tempo/guide_payments_virtual-addresses' },
							},
						],
					}
				}),
				sources: [
					...sources,
					{
						id: 'tempo',
						base: 'https://docs.tempo.xyz',
						description: 'Tempo protocol docs',
					},
				],
			},
		)

		expect(seen?.ai_search_options?.retrieval?.filters).toEqual({
			source: 'tempo',
		})
	})

	it('preserves explicit AI Search cache overrides', async () => {
		let seen: AiSearchSearchRequest | undefined
		await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 3,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'explicit cache override query',
							ai_search_options: {
								cache: { enabled: false },
							},
						},
					},
				}),
			}),
			{
				instance: instance(async (params) => {
					seen = params
					return { search_query: 'explicit cache override query', chunks: [] }
				}),
			},
		)

		expect(seen?.ai_search_options?.cache).toEqual({
			enabled: false,
			cache_threshold: 'close_enough',
		})
	})

	it('caches successful search results in the worker isolate', async () => {
		let calls = 0
		const searchInstance = instance(async () => {
			calls++
			return {
				search_query: 'unique cache query',
				chunks: [
					{
						id: '1',
						type: 'text',
						score: 1,
						text: 'cached docs',
						item: { key: 'viem/cached' },
					},
				],
			}
		})
		const reqBody = {
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/call',
			params: {
				name: 'search',
				arguments: {
					query: 'unique cache query',
				},
			},
		}

		await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify(reqBody),
			}),
			{ instance: searchInstance },
		)
		const second = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({ ...reqBody, id: 5 }),
			}),
			{ instance: searchInstance },
		)

		expect(calls).toBe(1)
		const text = await textContent(second)
		expect(text.result.chunks[0].text).toBe('cached docs')
	})

	it('coalesces identical concurrent search requests', async () => {
		let calls = 0
		let release: (() => void) | undefined
		const wait = new Promise<void>((resolve) => {
			release = resolve
		})
		const searchInstance = instance(async () => {
			calls++
			await wait
			return {
				search_query: 'concurrent cache query',
				chunks: [
					{
						id: '1',
						type: 'text',
						score: 1,
						text: 'shared docs',
						item: { key: 'viem/shared' },
					},
				],
			}
		})
		const reqBody = {
			jsonrpc: '2.0',
			method: 'tools/call',
			params: {
				name: 'search',
				arguments: {
					query: 'concurrent cache query',
				},
			},
		}
		const first = handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({ ...reqBody, id: 41 }),
			}),
			{ instance: searchInstance },
		)
		const second = handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({ ...reqBody, id: 42 }),
			}),
			{ instance: searchInstance },
		)
		await Promise.resolve()
		release?.()

		const [firstRes, secondRes] = await Promise.all([first, second])
		expect(calls).toBe(1)
		expect((await textContent(firstRes)).result.chunks[0].text).toBe(
			'shared docs',
		)
		expect((await textContent(secondRes)).result.chunks[0].text).toBe(
			'shared docs',
		)
	})

	it('returns compact cleaned chunks by default', async () => {
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				headers: { accept: 'text/event-stream' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 6,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: { query: 'pay fees' },
					},
				}),
			}),
			{
				instance: instance(async () => ({
					search_query: 'pay fees',
					chunks: [
						{
							id: '1',
							type: 'text',
							score: 0.987654321,
							text: '[Skip to content](#vocs-content)\nSearch...\n# Pay Fees\nUseful docs\nWas this helpful?',
							item: {
								key: 'viem/docs_pay-fees',
								metadata: {
									source: 'viem',
									url: 'https://viem.sh/tempo/pay-fees',
								},
							},
							scoring_details: { keyword_score: 1 },
						},
					],
				})),
			},
		)

		expect(res).toBeDefined()
		const text = await textContent(res)
		expect(text.result.chunks[0]).toEqual({
			score: 0.9877,
			source: 'viem',
			url: 'https://viem.sh/tempo/pay-fees',
			text: '# Pay Fees\nUseful docs',
		})
	})

	it('reconstructs compact result URLs from source item keys', async () => {
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 61,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'tempo wallet connector',
							source: 'wagmi',
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({
					search_query: 'tempo wallet connector',
					chunks: [
						{
							id: '1',
							type: 'text',
							score: 1,
							text: 'tempoWallet connector docs',
							item: { key: 'wagmi/tempo_connectors_tempoWallet.md' },
						},
					],
				})),
				sources,
			},
		)

		const text = await textContent(res)
		expect(text.result.chunks[0]).toEqual({
			score: 1,
			source: 'wagmi',
			url: 'https://wagmi.sh/tempo/connectors/tempoWallet',
			text: 'tempoWallet connector docs',
		})
	})

	it('can return the raw AI Search chunk shape when requested', async () => {
		let seen: AiSearchSearchRequest | undefined
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 7,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'pay fees raw',
							include_raw: true,
						},
					},
				}),
			}),
			{
				instance: instance(async (params) => {
					seen = params
					return {
						search_query: 'pay fees raw',
						chunks: [
							{
								id: '1',
								type: 'text',
								score: 1,
								text: 'Copy page for AI\n# Pay Fees',
								item: { key: 'viem/docs_pay-fees' },
								scoring_details: { keyword_score: 1 },
							},
							{
								id: '2',
								type: 'text',
								score: 0.9,
								text: 'same page duplicate',
								item: { key: 'viem/docs_pay-fees' },
							},
						],
					}
				}),
			},
		)

		expect(seen?.ai_search_options?.retrieval?.max_num_results).toBe(5)
		const text = await textContent(res)
		expect(text.result.chunks).toHaveLength(2)
		expect(text.result.chunks[0]).toMatchObject({
			id: '1',
			type: 'text',
			score: 1,
			text: '# Pay Fees',
			scoring_details: { keyword_score: 1 },
		})
	})

	it('deduplicates compact chunks by page', async () => {
		let seen: AiSearchSearchRequest | undefined
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 71,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'distinct pages query',
							max_results: 2,
						},
					},
				}),
			}),
			{
				instance: instance(async (params) => {
					seen = params
					return {
						search_query: 'distinct pages query',
						chunks: [
							{
								id: '1',
								type: 'text',
								score: 1,
								text: 'first page',
								item: {
									key: 'viem/a.md#one',
									metadata: {
										source: 'viem',
										url: 'https://viem.sh/a?x=1#one',
									},
								},
							},
							{
								id: '2',
								type: 'text',
								score: 0.9,
								text: 'duplicate page',
								item: {
									key: 'viem/a.md#two',
									metadata: { source: 'viem', url: 'https://viem.sh/a#two' },
								},
							},
							{
								id: '3',
								type: 'text',
								score: 0.8,
								text: 'second page',
								item: {
									key: 'viem/b.md',
									metadata: { source: 'viem', url: 'https://viem.sh/b' },
								},
							},
						],
					}
				}),
			},
		)

		expect(seen?.ai_search_options?.retrieval?.max_num_results).toBe(2)
		const text = await textContent(res)
		expect(text.result.chunks).toEqual([
			{
				score: 1,
				source: 'viem',
				url: 'https://viem.sh/a',
				text: 'first page',
			},
			{
				score: 0.8,
				source: 'viem',
				url: 'https://viem.sh/b',
				text: 'second page',
			},
		])
	})

	it('centers compact excerpts around query terms', async () => {
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 8,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'wallet connector',
							source: 'wagmi',
							max_chars_per_chunk: 300,
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({
					search_query: 'wallet connector',
					chunks: [
						{
							id: '1',
							type: 'text',
							score: 1,
							text: `${'intro '.repeat(120)}\nThe wallet connector setup uses createConfig.\n${'tail '.repeat(120)}`,
							item: { key: 'wagmi/docs_wallet' },
						},
					],
				})),
			},
		)

		const text = await textContent(res)
		const chunkText = text.result.chunks[0].text
		expect(chunkText.length).toBeLessThanOrEqual(310)
		expect(chunkText).toContain('wallet connector')
		expect(chunkText.startsWith('... ')).toBe(true)
		expect(chunkText.endsWith(' ...')).toBe(true)
	})

	it('bounds compact search output by total text chars', async () => {
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 81,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'wallet connector',
							max_results: 5,
							max_total_chars: 700,
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({
					search_query: 'wallet connector',
					chunks: [1, 2, 3, 4, 5].map((index) => ({
						id: String(index),
						type: 'text',
						score: 1 - index / 10,
						text: `wallet connector ${index} ${'docs '.repeat(60)}`,
						item: { key: `wagmi/page-${index}` },
					})),
				})),
				sources,
			},
		)

		const text = await textContent(res)
		const returnedTextChars = text.result.chunks
			.map((chunk: { text: string }) => chunk.text.length)
			.reduce((total: number, value: number) => total + value, 0)
		expect(text.result.chunks).toHaveLength(2)
		expect(returnedTextChars).toBeLessThanOrEqual(710)
	})

	it('rejects unknown source filters before querying AI Search', async () => {
		let called = false
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 9,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'wallet connector',
							source: 'unknown',
						},
					},
				}),
			}),
			{
				instance: instance(async () => {
					called = true
					return { search_query: '', chunks: [] }
				}),
				sources,
			},
		)

		expect(called).toBe(false)
		const body = await res?.json()
		expect(body.error.message).toBe('unknown source: unknown')
	})

	it('falls back to unfiltered search when metadata filters are stale', async () => {
		const calls: AiSearchSearchRequest[] = []
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 10,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'wallet connector',
							source: 'wagmi',
							max_results: 1,
						},
					},
				}),
			}),
			{
				instance: instance(async (params) => {
					calls.push(params)
					if (calls.length === 1)
						return { search_query: 'wallet connector', chunks: [] }
					return {
						search_query: 'wallet connector',
						chunks: [
							{
								id: '1',
								type: 'text',
								score: 0.5,
								text: 'viem docs',
								item: { key: 'viem/docs_wallet' },
							},
							{
								id: '2',
								type: 'text',
								score: 0.4,
								text: 'wagmi docs',
								item: { key: 'wagmi/docs_wallet' },
							},
						],
					}
				}),
				sources,
			},
		)

		expect(calls).toHaveLength(2)
		expect(calls[0]?.ai_search_options?.retrieval?.filters).toEqual({
			source: 'wagmi',
		})
		expect(calls[1]?.ai_search_options?.retrieval?.filters).toBeUndefined()
		expect(calls[1]?.ai_search_options?.retrieval?.max_num_results).toBe(20)

		const text = await textContent(res)
		expect(text.result.chunks).toEqual([
			{
				score: 0.4,
				source: 'wagmi',
				url: 'https://wagmi.sh/docs/wallet',
				text: 'wagmi docs',
			},
		])

		calls.length = 0
		await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 11,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'wallet connector',
							source: 'wagmi',
							max_results: 1,
						},
					},
				}),
			}),
			{
				instance: instance(async (params) => {
					calls.push(params)
					return { search_query: 'wallet connector', chunks: [] }
				}),
				sources,
			},
		)

		expect(calls).toHaveLength(0)

		await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 12,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'wallet connector setup',
							source: 'wagmi',
							max_results: 1,
						},
					},
				}),
			}),
			{
				instance: instance(async (params) => {
					calls.push(params)
					return {
						search_query: 'wallet connector setup',
						chunks: [
							{
								id: '1',
								type: 'text',
								score: 0.4,
								text: 'wagmi docs',
								item: { key: 'wagmi/docs_wallet' },
							},
						],
					}
				}),
				sources,
			},
		)

		expect(calls).toHaveLength(1)
		expect(calls[0]?.ai_search_options?.retrieval?.filters).toBeUndefined()
		expect(calls[0]?.ai_search_options?.retrieval?.max_num_results).toBe(20)
	})

	it('falls back to source llms.txt when filtered search returns no chunks', async () => {
		const tempoSource: Source = {
			id: 'tempo',
			base: 'https://docs.tempo.xyz',
			description: 'Tempo docs',
		}
		const fetches: string[] = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				fetches.push(url)
				if (url === 'https://docs.tempo.xyz/llms.txt') {
					return new Response(
						'- [Use virtual addresses for deposits](/guide/payments/virtual-addresses): Register a virtual-address master and derive deposit addresses.',
					)
				}
				if (
					url === 'https://docs.tempo.xyz/guide/payments/virtual-addresses.md'
				) {
					return new Response(
						'# Use virtual addresses for deposits\n\nRegister a virtual-address master and watch deposits.',
					)
				}
				return new Response('not found', { status: 404 })
			}),
		)

		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 111,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'How do virtual addresses work for deposits?',
							source: 'tempo',
							max_results: 3,
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({
					search_query: 'virtual',
					chunks: [],
				})),
				sources: [tempoSource],
			},
		)

		expect(fetches).toEqual([
			'https://docs.tempo.xyz/llms.txt',
			'https://docs.tempo.xyz/guide/payments/virtual-addresses.md',
		])
		const text = await textContent(res)
		expect(text.result.chunks).toEqual([
			{
				score: 0.85,
				source: 'tempo',
				url: 'https://docs.tempo.xyz/guide/payments/virtual-addresses',
				text: '# Use virtual addresses for deposits\n\nRegister a virtual-address master and watch deposits.',
			},
		])
	})

	it('reads local source fallback pages in parallel while preserving score order', async () => {
		const tempoSource: Source = {
			id: 'tempo-parallel',
			base: 'https://parallel.tempo.xyz',
		}
		let activePageFetches = 0
		let maxActivePageFetches = 0
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url === 'https://parallel.tempo.xyz/llms.txt') {
					return new Response(
						[
							'- [Virtual addresses](/guide/payments/virtual-addresses): virtual deposits',
							'- [Deposit funds](/guide/payments/deposits): deposit funds',
						].join('\n'),
					)
				}
				activePageFetches++
				maxActivePageFetches = Math.max(maxActivePageFetches, activePageFetches)
				await new Promise((resolve) => setTimeout(resolve, 5))
				activePageFetches--
				if (
					url ===
					'https://parallel.tempo.xyz/guide/payments/virtual-addresses.md'
				) {
					return new Response('# Virtual addresses\n\nvirtual deposits')
				}
				if (url === 'https://parallel.tempo.xyz/guide/payments/deposits.md') {
					return new Response('# Deposit funds\n\ndeposit funds')
				}
				return new Response('not found', { status: 404 })
			}),
		)

		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 112,
					method: 'tools/call',
					params: {
						name: 'search',
						arguments: {
							query: 'virtual deposits',
							source: 'tempo-parallel',
							max_results: 3,
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({
					search_query: 'virtual deposits',
					chunks: [],
				})),
				sources: [tempoSource],
			},
		)

		const text = await textContent(res)
		expect(maxActivePageFetches).toBe(2)
		expect(
			text.result.chunks.map((chunk: { url: string }) => chunk.url),
		).toEqual([
			'https://parallel.tempo.xyz/guide/payments/virtual-addresses',
			'https://parallel.tempo.xyz/guide/payments/deposits',
		])
	})

	it('coalesces concurrent source index fallback fetches', async () => {
		const source: Source = {
			id: 'tempo-index-coalesce',
			base: 'https://index-coalesce.tempo.xyz',
		}
		let indexFetches = 0
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url === 'https://index-coalesce.tempo.xyz/llms.txt') {
					indexFetches++
					await new Promise((resolve) => setTimeout(resolve, 5))
					return new Response(
						[
							'- [Virtual addresses](/virtual): virtual addresses',
							'- [Deposits](/deposits): stablecoin deposits',
						].join('\n'),
					)
				}
				if (url === 'https://index-coalesce.tempo.xyz/virtual.md') {
					return new Response('# Virtual addresses')
				}
				if (url === 'https://index-coalesce.tempo.xyz/deposits.md') {
					return new Response('# Deposits')
				}
				return new Response('not found', { status: 404 })
			}),
		)
		const searchInstance = instance(async () => ({
			search_query: '',
			chunks: [],
		}))

		const [virtual, deposits] = await Promise.all([
			handleMcp(
				new Request('https://mcp.tempo.xyz/', {
					method: 'POST',
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 211,
						method: 'tools/call',
						params: {
							name: 'search',
							arguments: {
								query: 'virtual addresses',
								source: 'tempo-index-coalesce',
							},
						},
					}),
				}),
				{ instance: searchInstance, sources: [source] },
			),
			handleMcp(
				new Request('https://mcp.tempo.xyz/', {
					method: 'POST',
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 212,
						method: 'tools/call',
						params: {
							name: 'search',
							arguments: {
								query: 'stablecoin deposits',
								source: 'tempo-index-coalesce',
							},
						},
					}),
				}),
				{ instance: searchInstance, sources: [source] },
			),
		])

		expect(indexFetches).toBe(1)
		expect((await textContent(virtual)).result.chunks[0].url).toBe(
			'https://index-coalesce.tempo.xyz/virtual',
		)
		expect((await textContent(deposits)).result.chunks[0].url).toBe(
			'https://index-coalesce.tempo.xyz/deposits',
		)
	})

	it('finds compact page candidates from a source index', async () => {
		const source: Source = {
			id: 'page-finder',
			base: 'https://page-finder.tempo.xyz',
		}
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				expect(url).toBe('https://page-finder.tempo.xyz/llms.txt')
				return new Response(
					[
						'- /virtual-addresses.md: stablecoin deposits',
						'- [Stablecoin fees](/fees): fee token setup',
						'- [Wallets](/wallets): account setup',
					].join('\n'),
				)
			}),
		)

		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 301,
					method: 'tools/call',
					params: {
						name: 'find_pages',
						arguments: {
							source: 'page-finder',
							query: 'virtual addresses deposits',
							max_results: 2,
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources: [source],
			},
		)

		const body = await textContent(res)
		expect(body.result).toMatchObject({
			source: 'page-finder',
			query: 'virtual addresses deposits',
		})
		expect(body.result.pages).toEqual([
			{
				title: 'Virtual addresses',
				url: 'https://page-finder.tempo.xyz/virtual-addresses',
				score: 0.35,
			},
		])
	})

	it('can return tool data as MCP structuredContent', async () => {
		const source: Source = {
			id: 'structured-pages',
			base: 'https://structured-pages.tempo.xyz',
		}
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response('- [Virtual addresses](/virtual): stablecoin deposits'),
			),
		)

		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 302,
					method: 'tools/call',
					params: {
						name: 'find_pages',
						arguments: {
							source: 'structured-pages',
							query: 'virtual addresses',
							response_format: 'structured',
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources: [source],
			},
		)

		const body = await res?.json()
		expect(body.result.content[0].text).toBe('page candidates found')
		expect(body.result.structuredContent.result.pages[0]).toMatchObject({
			title: 'Virtual addresses',
			url: 'https://structured-pages.tempo.xyz/virtual',
		})
	})

	it('exposes source resources for MCP clients', async () => {
		const list = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 12,
					method: 'resources/list',
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources,
			},
		)

		const listBody = await list?.json()
		expect(listBody.result.resources).toContainEqual(
			expect.objectContaining({
				uri: 'tempo-docs://source/viem',
				name: 'viem docs source',
			}),
		)

		const read = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 13,
					method: 'resources/read',
					params: { uri: 'tempo-docs://sources' },
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources,
			},
		)
		const readBody = await read?.json()
		expect(readBody.result.contents[0].text).toContain('`viem`')
		expect(readBody.result.contents[0].text).toContain('source')
	})

	it('exposes source indexes and exact pages as MCP resources', async () => {
		const source: Source = {
			id: 'resource-source',
			base: 'https://resource-source.tempo.xyz',
			description: 'Resource source docs',
		}
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url === 'https://resource-source.tempo.xyz/llms.txt') {
					return new Response(
						[
							'- [Virtual addresses](/virtual-addresses): Deposit guide',
							'- [Stablecoin fees](/fees): Fee guide',
						].join('\n'),
					)
				}
				if (url === 'https://resource-source.tempo.xyz/virtual-addresses.md') {
					return new Response(
						[
							'[Skip to content](#vocs-content)',
							'# Virtual addresses',
							'Use virtual addresses for deposits.',
							'Was this helpful?',
						].join('\n'),
					)
				}
				return new Response('not found', { status: 404 })
			}),
		)

		const templates = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 121,
					method: 'resources/templates/list',
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources: [source],
			},
		)
		const templatesBody = await templates?.json()
		expect(templatesBody.result.resourceTemplates).toContainEqual(
			expect.objectContaining({
				uriTemplate: 'tempo-docs://source/{source}/index',
			}),
		)

		const index = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 122,
					method: 'resources/read',
					params: { uri: 'tempo-docs://source/resource-source/index' },
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources: [source],
			},
		)
		const indexBody = await index?.json()
		expect(indexBody.result.contents[0].text).toContain(
			'[Virtual addresses](https://resource-source.tempo.xyz/virtual-addresses)',
		)

		const page = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 123,
					method: 'resources/read',
					params: {
						uri: 'tempo-docs://source/resource-source/page/virtual-addresses',
					},
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources: [source],
			},
		)
		const pageBody = await page?.json()
		expect(pageBody.result.contents[0].text).toContain('# Virtual addresses')
		expect(pageBody.result.contents[0].text).not.toContain('Skip to content')
		expect(pageBody.result.contents[0].text).not.toContain('Was this helpful?')
	})

	it('reads an exact source page as bounded cleaned Markdown', async () => {
		let fetches = 0
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				fetches++
				expect(url).toBe('https://viem.sh/docs/cache.md')
				return new Response(
					`<!--
Sitemap:
- [Cached](/docs/cache)
-->

[Skip to content](#vocs-content)
Search...

# Cached Page

${'important '.repeat(80)}

Was this helpful?`,
				)
			}),
		)

		const first = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 14,
					method: 'tools/call',
					params: {
						name: 'read_page',
						arguments: {
							source: 'viem',
							path: '/docs/cache',
							max_chars: 300,
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources,
			},
		)
		const second = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 15,
					method: 'tools/call',
					params: {
						name: 'read_page',
						arguments: {
							source: 'viem',
							url: 'https://viem.sh/docs/cache',
							max_chars: 300,
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources,
			},
		)

		expect(fetches).toBe(1)
		const firstText = await textContent(first)
		const secondText = await textContent(second)
		expect(firstText.result).toMatchObject({
			source: 'viem',
			url: 'https://viem.sh/docs/cache',
			truncated: true,
		})
		expect(firstText.result.text).toContain('# Cached Page')
		expect(firstText.result.text).not.toContain('Sitemap:')
		expect(firstText.result.text).not.toContain('Search...')
		expect(secondText.result.text).toBe(firstText.result.text)
	})

	it('returns query-focused read_page excerpts when truncating', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						[
							'# Long Page',
							'Intro section',
							'alpha '.repeat(120),
							'## Stablecoin fee tokens',
							'Configure users to pay transaction fees in supported stablecoins.',
							'beta '.repeat(120),
						].join('\n'),
					),
			),
		)

		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 151,
					method: 'tools/call',
					params: {
						name: 'read_page',
						arguments: {
							source: 'viem',
							path: '/docs/long',
							query: 'stablecoin fee tokens',
							max_chars: 300,
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources,
			},
		)

		const body = await textContent(res)
		expect(body.result.truncated).toBe(true)
		expect(body.result.text).toContain('# Long Page')
		expect(body.result.text).toContain('## Stablecoin fee tokens')
		expect(body.result.text).not.toContain('Intro section')
	})

	it('coalesces identical concurrent read_page fetches', async () => {
		const source: Source = {
			id: 'parallel-page',
			base: 'https://parallel-page.tempo.xyz',
		}
		let fetches = 0
		let release: (() => void) | undefined
		const wait = new Promise<void>((resolve) => {
			release = resolve
		})
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				fetches++
				await wait
				return new Response('# Parallel Page\n\nsame content')
			}),
		)
		const reqBody = {
			jsonrpc: '2.0',
			method: 'tools/call',
			params: {
				name: 'read_page',
				arguments: {
					source: 'parallel-page',
					path: '/docs/page',
				},
			},
		}

		const first = handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({ ...reqBody, id: 181 }),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources: [source],
			},
		)
		const second = handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({ ...reqBody, id: 182 }),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources: [source],
			},
		)
		await Promise.resolve()
		release?.()

		const [firstText, secondText] = await Promise.all([
			textContent(await first),
			textContent(await second),
		])
		expect(fetches).toBe(1)
		expect(firstText.result.text).toBe('# Parallel Page\n\nsame content')
		expect(secondText.result.text).toBe(firstText.result.text)
	})

	it('rejects read_page URLs outside the selected source origin', async () => {
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 16,
					method: 'tools/call',
					params: {
						name: 'read_page',
						arguments: {
							source: 'viem',
							url: 'https://example.com/docs/cache',
						},
					},
				}),
			}),
			{
				instance: instance(async () => ({ search_query: '', chunks: [] })),
				sources,
			},
		)

		const body = await res?.json()
		expect(body.error.message).toBe('path or url must be provided')
	})

	it('falls back to the upstream proxy for unsupported MCP methods', async () => {
		const res = await handleMcp(
			new Request('https://mcp.tempo.xyz/', {
				method: 'POST',
				body: JSON.stringify({ jsonrpc: '2.0', id: 17, method: 'initialize' }),
			}),
			{ instance: instance(async () => ({ search_query: '', chunks: [] })) },
		)

		expect(res).toBeUndefined()
	})
})

describe('captureMcpAnalytics', () => {
	it('does nothing without a PostHog project key', async () => {
		const fetch = vi.fn()
		vi.stubGlobal('fetch', fetch)
		const ctx = { waitUntil: vi.fn() } as unknown as ExecutionContext
		const req = new Request('https://mcp.tempo.xyz/', {
			method: 'POST',
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/list',
			}),
		})
		const body = await parseJsonRpcRequest(req)

		captureMcpAnalytics(
			req,
			body,
			new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} })),
			{},
			ctx,
		)

		expect(ctx.waitUntil).not.toHaveBeenCalled()
		expect(fetch).not.toHaveBeenCalled()
	})

	it('captures redacted tool-call analytics when configured', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response('{}'))
		vi.stubGlobal('fetch', fetch)
		const waitUntil = vi.fn((promise: Promise<unknown>) => promise)
		const ctx = { waitUntil } as unknown as ExecutionContext
		const req = new Request('https://mcp.tempo.xyz/', {
			method: 'POST',
			headers: { 'mcp-session-id': 'session-1' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 2,
				method: 'tools/call',
				params: {
					name: 'search',
					arguments: {
						query: 'tempo docs',
						api_key: 'secret',
					},
				},
			}),
		})
		const body = await parseJsonRpcRequest(req)

		captureMcpAnalytics(
			req,
			body,
			new Response(
				JSON.stringify({
					jsonrpc: '2.0',
					id: 2,
					result: { content: [{ type: 'text', text: 'ok' }] },
				}),
			),
			{ POSTHOG_PROJECT_API_KEY: 'phc_test' },
			ctx,
		)

		await waitUntil.mock.calls[0][0]
		expect(fetch).toHaveBeenCalledWith(
			'https://us.i.posthog.com/capture/',
			expect.objectContaining({
				method: 'POST',
			}),
		)
		const payload = JSON.parse(fetch.mock.calls[0][1].body)
		expect(payload).toMatchObject({
			api_key: 'phc_test',
			event: '$mcp_tool_call',
			distinct_id: 'session-1',
		})
		expect(payload.properties).toMatchObject({
			$session_id: 'session-1',
			$mcp_tool_name: 'search',
			$mcp_parameters: {
				query: 'tempo docs',
				api_key: '[redacted]',
			},
		})
	})
})

async function textContent(res: Response | undefined) {
	const raw = await res?.text()
	const data =
		raw
			?.split('\n')
			.find((line) => line.startsWith('data: '))
			?.slice('data: '.length) ?? raw
	const payload = JSON.parse(data ?? '{}')
	return JSON.parse(payload.result.content[0].text)
}
