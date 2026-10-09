import {
	createExecutionContext,
	createScheduledController,
	waitOnExecutionContext,
} from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index.js'

const SOURCE = { id: 'fixture', base: 'https://docs.example' }

function testEnv(uploads: string[]): Env {
	return {
		ETAG_CACHE: env.ETAG_CACHE,
		SOURCES: JSON.stringify([SOURCE]),
		AI_SEARCH_INSTANCE_ID: 'test-instance',
		PUBLIC_MCP_ENDPOINT: 'https://mcp.example',
		AI_SEARCH: {
			get: () => ({
				items: {
					upload: async (key: string) => {
						uploads.push(key)
						return { id: `item-${key}`, key }
					},
					delete: async () => {},
				},
			}),
		},
	} as unknown as Env
}

async function runScheduled(
	cron: string,
	workerEnv: Env,
	scheduledTime = Date.parse('2026-10-09T14:00:00Z'),
): Promise<void> {
	const ctx = createExecutionContext()
	await worker.scheduled(
		createScheduledController({
			cron,
			scheduledTime,
		}),
		workerEnv,
		ctx,
	)
	await waitOnExecutionContext(ctx)
}

beforeEach(async () => {
	for (const key of [
		'etag:fixture',
		'index:fixture',
		'source_url:fixture',
		'last_sync:fixture',
		'retry_force:fixture',
		'pending_deletion:fixture',
	]) {
		await env.ETAG_CACHE.delete(key)
	}
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('scheduled Worker', () => {
	it('runs the hourly ingestion through fetch, AI Search upload, and KV state', async () => {
		const uploads: string[] = []
		const fetchMock = vi.fn(async (input: string, _init?: RequestInit) =>
			input === 'https://docs.example/llms.txt'
				? new Response('- [Page](/page)', {
						status: 200,
						headers: { etag: '"index-v1"' },
					})
				: new Response('# Page', {
						status: 200,
						headers: { etag: '"page-v1"' },
					}),
		)
		vi.stubGlobal('fetch', fetchMock)
		vi.spyOn(console, 'info').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})

		await runScheduled('0 * * * *', testEnv(uploads))

		expect(uploads).toEqual(['fixture/page.md'])
		expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([
			'https://docs.example/llms.txt',
			'https://docs.example/page.md',
		])
		expect(await env.ETAG_CACHE.get('etag:fixture')).toBe('"index-v1"')
		expect(
			JSON.parse((await env.ETAG_CACHE.get('index:fixture')) ?? '{}'),
		).toMatchObject({
			'fixture/page.md': { id: 'item-fixture/page.md' },
		})
	})

	it('uses the persisted source ETag on the next hourly run', async () => {
		const uploads: string[] = []
		await env.ETAG_CACHE.put('etag:fixture', '"index-v1"')
		const fetchMock = vi.fn(async () => new Response(null, { status: 304 }))
		vi.stubGlobal('fetch', fetchMock)
		vi.spyOn(console, 'info').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})

		await runScheduled('0 * * * *', testEnv(uploads))

		expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
			'https://docs.example/llms.txt',
			expect.objectContaining({ headers: { 'If-None-Match': '"index-v1"' } }),
		)
		expect(uploads).toEqual([])
	})

	it('keeps source state retryable when an hourly page fetch fails', async () => {
		const uploads: string[] = []
		const fetchMock = vi.fn(async (input: string) =>
			input === 'https://docs.example/llms.txt'
				? new Response('- [Page](/page)', {
						status: 200,
						headers: { etag: '"index-v1"' },
					})
				: new Response('upstream error', { status: 503 }),
		)
		vi.stubGlobal('fetch', fetchMock)
		vi.spyOn(console, 'info').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})

		await runScheduled('0 * * * *', testEnv(uploads))

		expect(uploads).toEqual([])
		expect(await env.ETAG_CACHE.get('etag:fixture')).toBeNull()
		expect(await env.ETAG_CACHE.get('index:fixture')).toBeNull()
		expect(await env.ETAG_CACHE.get('last_sync:fixture')).toBeTruthy()
	})

	it('persists successful pages when another page fails', async () => {
		const uploads: string[] = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string) => {
				if (input === 'https://docs.example/llms.txt')
					return new Response('- [One](/one)\n- [Two](/two)', {
						headers: { etag: '"index-v2"' },
					})
				if (input === 'https://docs.example/two.md')
					return new Response('upstream error', { status: 503 })
				return new Response('# One')
			}),
		)
		vi.spyOn(console, 'info').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})

		await runScheduled('0 * * * *', testEnv(uploads))

		expect(uploads).toEqual(['fixture/one.md'])
		expect(
			JSON.parse((await env.ETAG_CACHE.get('index:fixture')) ?? '{}'),
		).toMatchObject({
			'fixture/one.md': { id: 'item-fixture/one.md' },
		})
		expect(await env.ETAG_CACHE.get('retry_force:fixture')).toBe('1')
		expect(await env.ETAG_CACHE.get('etag:fixture')).toBeNull()
	})

	it('bypasses the source ETag at the midnight forced run', async () => {
		const uploads: string[] = []
		await env.ETAG_CACHE.put('etag:fixture', '"index-v1"')
		const fetchMock = vi.fn(async (input: string, _init?: RequestInit) =>
			input === 'https://docs.example/llms.txt'
				? new Response('- [Page](/page)', { status: 200 })
				: new Response('# Page', { status: 200 }),
		)
		vi.stubGlobal('fetch', fetchMock)
		vi.spyOn(console, 'info').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})

		await runScheduled(
			'0 * * * *',
			testEnv(uploads),
			Date.parse('2026-10-10T00:00:00Z'),
		)

		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: {} })
		expect(uploads).toEqual(['fixture/page.md'])
	})

	it('routes minute events to the public health probe', async () => {
		const uploads: string[] = []
		const methods: string[] = []
		const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
			const request = JSON.parse(String(init?.body)) as {
				method: string
				params: { name?: string }
			}
			methods.push(request.params.name ?? request.method)
			const result =
				request.method === 'initialize'
					? { serverInfo: { name: 'fixture' } }
					: request.method === 'tools/list'
						? {
								tools: ['search', 'find_pages', 'read_page'].map((name) => ({
									name,
								})),
							}
						: request.method === 'resources/list'
							? { resources: [{ uri: 'tempo-docs://sources' }] }
							: {
									structuredContent: {
										result:
											request.params.name === 'search'
												? { chunks: [{}] }
												: request.params.name === 'find_pages'
													? { pages: [{ url: 'https://docs.example/page' }] }
													: { text: '# Page' },
									},
								}
			return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
				status: 200,
			})
		})
		vi.stubGlobal('fetch', fetchMock)
		vi.spyOn(console, 'info').mockImplementation(() => {})
		vi.spyOn(console, 'log').mockImplementation(() => {})

		await runScheduled('* * * * *', testEnv(uploads))

		expect(methods).toEqual([
			'initialize',
			'tools/list',
			'resources/list',
			'search',
			'find_pages',
			'read_page',
		])
		expect(uploads).toEqual([])
		expect(await env.ETAG_CACHE.get('index:fixture')).toBeNull()
	})
})
