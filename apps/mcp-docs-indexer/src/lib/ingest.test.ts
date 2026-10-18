import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sourceIndexStatus, syncSource } from './ingest.js'
import type { Source } from './sources.js'

const SOURCE: Source = { id: 'viem', base: 'https://viem.sh' }
const EMPTY_METADATA_HASH =
	'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

type UploadCall = {
	key: string
	content: string
	metadata: Record<string, unknown> | undefined
}

/**
 * Fake AI Search instance. Returns deterministic item ids (`item-<key>`) so
 * tests can assert delete-by-id round trips.
 */
function fakeInstance(opts?: {
	deleteFails?: Set<string>
	uploadStatus?: AiSearchItemInfo['status']
}): {
	instance: AiSearchInstance
	uploads: UploadCall[]
	deletes: string[]
	statuses: Map<string, AiSearchItemInfo['status']>
} {
	const uploads: UploadCall[] = []
	const deletes: string[] = []
	const statuses = new Map<string, AiSearchItemInfo['status']>()
	const instance = {
		items: {
			upload: async (
				key: string,
				content: string,
				options?: { metadata?: Record<string, unknown> },
			) => {
				uploads.push({ key, content, metadata: options?.metadata })
				const id = `item-${key}`
				const status = opts?.uploadStatus ?? 'completed'
				statuses.set(id, status)
				return { id, key, status }
			},
			get: (id: string) => ({
				info: async () => ({
					id,
					key: id.slice('item-'.length),
					status: statuses.get(id) ?? 'completed',
				}),
			}),
			delete: async (id: string) => {
				if (opts?.deleteFails?.has(id)) throw new Error(`boom: ${id}`)
				deletes.push(id)
			},
		},
	} as unknown as AiSearchInstance
	return { instance, uploads, deletes, statuses }
}

function fakeKv(seed?: Record<string, string>) {
	const store = new Map<string, string>(Object.entries(seed ?? {}))
	const kv = {
		get: async (k: string) => store.get(k) ?? null,
		put: async (k: string, v: string) => {
			store.set(k, v)
		},
		delete: async (k: string) => {
			store.delete(k)
		},
	} as unknown as KVNamespace
	return { kv, store }
}

const fetchMock = vi.fn()

beforeEach(() => {
	fetchMock.mockReset()
	vi.stubGlobal('fetch', fetchMock)
	vi.spyOn(console, 'info').mockImplementation(() => {})
	vi.spyOn(console, 'warn').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

function mockResponse(init: {
	status?: number
	body?: string
	etag?: string
	contentType?: string
}): Response {
	const status = init.status ?? 200
	const headers = new Headers()
	if (init.etag) headers.set('etag', init.etag)
	if (init.contentType) headers.set('content-type', init.contentType)
	return {
		status,
		ok: status >= 200 && status < 300,
		headers,
		text: async () => init.body ?? '',
	} as unknown as Response
}

async function confirmDeletion(
	instance: AiSearchInstance,
	etagCache: KVNamespace,
): Promise<Awaited<ReturnType<typeof syncSource>>> {
	const now = vi.spyOn(Date, 'now').mockReturnValue(0)
	expect(
		await syncSource({ source: SOURCE, instance, etagCache }),
	).toMatchObject({
		status: 'pending_deletion',
		removed: 1,
	})
	now.mockReturnValue(300_001)
	return syncSource({ source: SOURCE, instance, etagCache })
}

describe('sourceIndexStatus', () => {
	it('reads status counts for one source without changing items', async () => {
		const list = vi.fn(
			async (options: {
				status: string
				metadata_filter: string
				per_page: number
			}) => ({
				result: options.status === 'error' ? [{ error: 'bad document' }] : [],
				result_info: {
					total_count:
						options.status === 'completed'
							? 5
							: options.status === 'error'
								? 2
								: 0,
				},
			}),
		)
		const instance = { items: { list } } as unknown as AiSearchInstance

		expect(await sourceIndexStatus(instance, 'tempo')).toMatchObject({
			source: 'tempo',
			counts: { completed: 5, error: 2 },
			sample_error: 'bad document',
		})
		expect(list).toHaveBeenCalledTimes(6)
		for (const [options] of list.mock.calls) {
			expect(options.metadata_filter).toBe(JSON.stringify({ source: 'tempo' }))
			expect(options.per_page).toBe(1)
		}
	})
})

describe('syncSource — llms.txt index', () => {
	it('returns `unchanged` when llms.txt returns 304', async () => {
		const { instance, uploads } = fakeInstance()
		const { kv, store } = fakeKv({ 'etag:viem': 'W/"old"' })

		fetchMock.mockResolvedValueOnce(mockResponse({ status: 304 }))

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({ source: 'viem', status: 'unchanged' })
		expect(report).toHaveProperty('duration_ms')
		expect(uploads).toHaveLength(0)
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
			headers: { 'If-None-Match': 'W/"old"' },
		})
		expect(store.get('etag:viem')).toBe('W/"old"')
	})

	it('does not claim completion when a forced retry receives 304', async () => {
		const { instance } = fakeInstance()
		const { kv } = fakeKv({ 'retry_force:viem': '1' })
		fetchMock.mockResolvedValueOnce(mockResponse({ status: 304 }))

		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'error',
			error: 'index returned 304 during retry',
		})
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: {} })
	})

	it('returns `error` when llms.txt returns non-2xx', async () => {
		const { instance } = fakeInstance()
		const { kv } = fakeKv()
		fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }))

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({
			source: 'viem',
			status: 'error',
			error: 'index 500',
		})
	})

	it('returns `error` when fetch itself throws', async () => {
		const { instance } = fakeInstance()
		const { kv } = fakeKv()
		fetchMock.mockRejectedValueOnce(new Error('network down'))

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({
			source: 'viem',
			status: 'error',
			error: 'network down',
		})
	})

	it('with force=true, bypasses the llms.txt ETag', async () => {
		const { instance } = fakeInstance()
		const { kv } = fakeKv({ 'etag:viem': 'W/"old"' })

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [A](/a)\n', etag: 'W/"new"' })
			}
			return mockResponse({ body: '# a' })
		})

		await syncSource({
			source: SOURCE,
			instance,
			etagCache: kv,
			force: true,
		})

		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: {} })
	})
})

describe('syncSource — page uploads', () => {
	it('rejects pages whose UTF-8 bytes exceed the upload limit', async () => {
		const { instance, uploads } = fakeInstance()
		const { kv, store } = fakeKv()
		fetchMock.mockImplementation(async (url: string) =>
			url === 'https://viem.sh/llms.txt'
				? mockResponse({ body: '- [Large](/large)', etag: 'W/"new"' })
				: mockResponse({ body: `# Large\n${'é'.repeat(1_750_001)}` }),
		)

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({ status: 'synced', pages: 0, failed: 1 })
		expect(uploads).toHaveLength(0)
		expect(store.has('etag:viem')).toBe(false)
		expect(console.warn).toHaveBeenCalledWith(
			'page.too_large',
			expect.objectContaining({ bytes: 3_500_010 }),
		)
	})

	it('rejects HTML returned from a Markdown URL', async () => {
		const { instance, uploads } = fakeInstance()
		const { kv, store } = fakeKv({
			'index:viem': JSON.stringify({
				'viem/tooltip.md': { id: 'existing-tooltip' },
			}),
		})
		fetchMock.mockImplementation(async (url: string) =>
			url === 'https://viem.sh/llms.txt'
				? mockResponse({ body: '- [Tooltip](/tooltip)', etag: 'W/"next"' })
				: mockResponse({
						body: '<!doctype html><html><body>Site shell</body></html>',
						contentType: 'text/html; charset=utf-8',
					}),
		)

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({ status: 'synced', pages: 0, failed: 1 })
		expect(uploads).toEqual([])
		expect(store.has('etag:viem')).toBe(false)
		expect(JSON.parse(store.get('index:viem') ?? '{}')).toEqual({
			'viem/tooltip.md': { id: 'existing-tooltip', index_retry: true },
		})
		expect(console.warn).toHaveBeenCalledWith(
			'page.html_response',
			expect.objectContaining({
				source: 'viem',
				url: 'https://viem.sh/tooltip',
			}),
		)
	})

	it('ingests TIP pages linked from the HTML homepage', async () => {
		const source: Source = {
			id: 'tips',
			base: 'https://tips.sh',
			indexPath: '/',
		}
		const { instance, uploads } = fakeInstance()
		const { kv } = fakeKv()
		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://tips.sh/') {
				return mockResponse({
					body: '<!DOCTYPE html><a href="/0001">TIP-0001</a>',
				})
			}
			if (url === 'https://tips.sh/0001.md') {
				return mockResponse({ body: '# Tempo Transaction' })
			}
			throw new Error(`unexpected: ${url}`)
		})

		expect(await syncSource({ source, instance, etagCache: kv })).toMatchObject(
			{ status: 'synced', pages: 1, failed: 0 },
		)
		expect(uploads.map((upload) => upload.key)).toEqual(['tips/0001.md'])
	})

	it('keeps nested paths distinct from underscores in item keys', async () => {
		const { instance, uploads } = fakeInstance()
		const { kv, store } = fakeKv()
		fetchMock.mockImplementation(async (url: string) =>
			url === 'https://viem.sh/llms.txt'
				? mockResponse({ body: '- [Nested](/a/b)\n- [Underscore](/a_b)' })
				: mockResponse({ body: `# ${url}` }),
		)

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({ status: 'synced', pages: 2, failed: 0 })
		expect(uploads.map((upload) => upload.key).sort()).toEqual([
			'viem/a/b.md',
			'viem/a_b.md',
		])
		expect(
			Object.keys(JSON.parse(store.get('index:viem') ?? '{}')).sort(),
		).toEqual(['viem/a/b.md', 'viem/a_b.md'])
	})

	it('tracks queued uploads until AI Search reports completion', async () => {
		const { instance, uploads, statuses } = fakeInstance({
			uploadStatus: 'queued',
		})
		const { kv, store } = fakeKv()
		let indexUnchanged = false
		fetchMock.mockImplementation(async (url: string) =>
			url === 'https://viem.sh/llms.txt'
				? indexUnchanged
					? mockResponse({ status: 304 })
					: mockResponse({ body: '- [A](/a)', etag: 'W/"index"' })
				: mockResponse({ body: '# a' }),
		)

		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'pending_index',
			pending: 1,
			pages: 1,
		})
		expect(store.get('etag:viem')).toBe('W/"index"')
		indexUnchanged = true
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'pending_index',
			pending: 1,
		})
		statuses.set('item-viem/a.md', 'completed')
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'unchanged',
		})
		expect(uploads).toHaveLength(1)
		expect(
			JSON.parse(store.get('index:viem') ?? '{}')['viem/a.md'],
		).toMatchObject({
			index_pending: false,
		})
	})

	it('retries an AI Search indexing error despite unchanged source and page ETags', async () => {
		const { instance, uploads, statuses } = fakeInstance({
			uploadStatus: 'queued',
		})
		const { kv, store } = fakeKv()
		let secondPass = false
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [A](/a)', etag: 'W/"index"' })
			}
			const headers = init?.headers as Record<string, string>
			if (secondPass && headers['If-None-Match']) {
				return mockResponse({ status: 304 })
			}
			return mockResponse({ body: '# a', etag: 'W/"page"' })
		})

		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'pending_index',
		})
		statuses.set('item-viem/a.md', 'error')
		secondPass = true
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'pending_index',
			pages: 1,
			failed: 0,
		})
		expect(uploads).toHaveLength(2)
		expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ headers: {} })
		expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ headers: {} })
		expect(
			JSON.parse(store.get('index:viem') ?? '{}')['viem/a.md'],
		).toMatchObject({
			index_pending: true,
		})
	})

	it('does not commit an upload that immediately reports indexing error', async () => {
		const { instance } = fakeInstance({ uploadStatus: 'error' })
		const { kv, store } = fakeKv()
		fetchMock.mockImplementation(async (url: string) =>
			url === 'https://viem.sh/llms.txt'
				? mockResponse({ body: '- [A](/a)', etag: 'W/"index"' })
				: mockResponse({ body: '# a' }),
		)

		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'synced',
			pages: 0,
			failed: 1,
		})
		expect(store.has('etag:viem')).toBe(false)
		expect(JSON.parse(store.get('index:viem') ?? '{}')).toEqual({})
	})

	it('rotates status checks so a long pending queue cannot starve later items', async () => {
		const { instance, statuses } = fakeInstance()
		const index = Object.fromEntries(
			Array.from({ length: 21 }, (_, i) => {
				const key = `viem/page-${i}.md`
				const id = `item-${key}`
				statuses.set(id, i === 20 ? 'error' : 'queued')
				return [key, { id, index_pending: true }]
			}),
		)
		const { kv, store } = fakeKv({ 'index:viem': JSON.stringify(index) })
		fetchMock.mockResolvedValue(mockResponse({ status: 304 }))

		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'pending_index',
			pending: 21,
		})
		expect(store.get('index_cursor:viem')).toBe('20')
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'pending_index',
			pending: 20,
		})
		expect(
			JSON.parse(store.get('index:viem') ?? '{}')['viem/page-20.md'],
		).toMatchObject({
			index_retry: true,
		})
	})

	it('does not claim completion if the index returns 304 during an item retry', async () => {
		const { instance, statuses } = fakeInstance()
		statuses.set('item-viem/a.md', 'error')
		const { kv, store } = fakeKv({
			'index:viem': JSON.stringify({
				'viem/a.md': { id: 'item-viem/a.md', index_pending: true },
			}),
		})
		fetchMock.mockResolvedValue(mockResponse({ status: 304 }))

		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'error',
			error: 'index returned 304 during retry',
		})
		expect(
			JSON.parse(store.get('index:viem') ?? '{}')['viem/a.md'],
		).toMatchObject({
			index_retry: true,
		})
	})

	it('uploads each page with source+url metadata', async () => {
		const { instance, uploads } = fakeInstance()
		const { kv, store } = fakeKv()

		const llmsTxt = `
- [Foo](https://viem.sh/docs/foo)
- [Bar](/docs/bar)
`
		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: llmsTxt, etag: 'W/"new"' })
			}
			if (url.endsWith('.md')) return mockResponse({ body: `# Body ${url}` })
			throw new Error(`unexpected: ${url}`)
		})

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({
			source: 'viem',
			status: 'synced',
			pages: 2,
			unchanged: 0,
			failed: 0,
			deleted: 0,
		})
		expect(uploads.map((u) => u.key).sort()).toEqual([
			'viem/docs/bar.md',
			'viem/docs/foo.md',
		])
		for (const u of uploads) {
			expect(u.metadata).toEqual({
				source: 'viem',
				url: expect.any(String),
				title: expect.any(String),
			})
		}
		expect(store.get('etag:viem')).toBe('W/"new"')
		expect(store.get('last_sync:viem')).toBeTruthy()

		const idx = JSON.parse(store.get('index:viem') ?? '{}')
		expect(Object.keys(idx).sort()).toEqual([
			'viem/docs/bar.md',
			'viem/docs/foo.md',
		])
		expect(idx['viem/docs/bar.md']).toMatchObject({
			id: 'item-viem/docs/bar.md',
			content_hash: expect.any(String),
		})
	})

	it('fetches existing bare .md pages without double-suffixing item keys', async () => {
		const source: Source = { id: 'regen', base: 'https://regen.tempo.xyz' }
		const { instance, uploads } = fakeInstance()
		const { kv, store } = fakeKv()

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://regen.tempo.xyz/llms.txt') {
				return mockResponse({
					body: '- /otp.md: One-time passcode fields\n- /agents.txt: alias',
				})
			}
			if (url === 'https://regen.tempo.xyz/otp.md') {
				return mockResponse({ body: '# OTP' })
			}
			throw new Error(`unexpected: ${url}`)
		})

		const report = await syncSource({ source, instance, etagCache: kv })

		expect(report).toMatchObject({
			source: 'regen',
			status: 'synced',
			pages: 1,
			failed: 0,
		})
		expect(uploads.map((u) => u.key)).toEqual(['regen/otp.md'])
		expect(fetchMock).toHaveBeenCalledWith(
			'https://regen.tempo.xyz/otp.md',
			expect.any(Object),
		)
		expect(Object.keys(JSON.parse(store.get('index:regen') ?? '{}'))).toEqual([
			'regen/otp.md',
		])
	})

	it('strips repeated Vocs sitemap comments and docs chrome before upload', async () => {
		const source: Source = { id: 'vocs', base: 'https://vocs.dev' }
		const { instance, uploads } = fakeInstance()
		const { kv } = fakeKv()

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://vocs.dev/llms.txt') {
				return mockResponse({ body: '- [MCP Server](/features/mcp-server)' })
			}
			if (url === 'https://vocs.dev/features/mcp-server.md') {
				return mockResponse({
					body: `<!--
Sitemap:
- [What is Vocs](/introduction/what-is-vocs)
- [MCP Server](/features/mcp-server)
-->

[Skip to content](#vocs-content)
Search...

# MCP Server

> **Can't find what you're looking for?** Use the docs MCP server.
>
> **Have feedback?** Send it to the docs team.

Expose your docs and source code to AI assistants.

Was this helpful?
Copy page for AI`,
				})
			}
			throw new Error(`unexpected: ${url}`)
		})

		const report = await syncSource({ source, instance, etagCache: kv })

		expect(report).toMatchObject({ status: 'synced', pages: 1, failed: 0 })
		expect(uploads[0]?.content).toBe(
			'# MCP Server\n\nExpose your docs and source code to AI assistants.',
		)
	})

	it('sets title metadata from the first markdown H1', async () => {
		const { instance, uploads } = fakeInstance()
		const { kv } = fakeKv()

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [Foo](/foo)' })
			}
			return mockResponse({
				body: '# Connect To Wallets\n\nBody text here.',
			})
		})

		await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(uploads[0]?.metadata).toMatchObject({ title: 'Connect To Wallets' })
	})

	it('omits title metadata when the page has no H1', async () => {
		const { instance, uploads } = fakeInstance()
		const { kv } = fakeKv()

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [Foo](/foo)' })
			}
			return mockResponse({ body: '## Subheading only\n\nBody text.' })
		})

		await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(uploads[0]?.metadata).not.toHaveProperty('title')
	})
})

describe('syncSource — per-page conditional fetch', () => {
	it('sends If-None-Match per page using stored ETags and skips 304s', async () => {
		const { instance, uploads } = fakeInstance()
		const prevIndex = {
			'viem/a.md': { id: 'item-viem/a.md', etag: 'W/"a1"' },
			'viem/b.md': { id: 'item-viem/b.md', etag: 'W/"b1"' },
		}
		const { kv, store } = fakeKv({
			'index:viem': JSON.stringify(prevIndex),
		})

		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [A](/a)\n- [B](/b)' })
			}
			if (url === 'https://viem.sh/a.md') {
				expect(
					(init?.headers as Record<string, string>)?.['If-None-Match'],
				).toBe('W/"a1"')
				return mockResponse({ status: 304 })
			}
			if (url === 'https://viem.sh/b.md') {
				expect(
					(init?.headers as Record<string, string>)?.['If-None-Match'],
				).toBe('W/"b1"')
				return mockResponse({ body: '# updated', etag: 'W/"b2"' })
			}
			throw new Error(`unexpected: ${url}`)
		})

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({
			status: 'synced',
			pages: 1,
			unchanged: 1,
			failed: 0,
			deleted: 0,
		})
		expect(uploads.map((u) => u.key)).toEqual(['viem/b.md'])

		const idx = JSON.parse(store.get('index:viem') ?? '{}')
		expect(idx['viem/a.md']).toEqual({
			id: 'item-viem/a.md',
			etag: 'W/"a1"',
		})
		expect(idx['viem/b.md']).toMatchObject({
			id: 'item-viem/b.md',
			etag: 'W/"b2"',
			content_hash: expect.any(String),
		})
	})

	it('skips upload when cleaned content hash is unchanged despite a new ETag', async () => {
		const { instance, uploads } = fakeInstance()
		const contentHash =
			'b2e77fbb5f564e2145071c75ac6a7d56478cf3ef696e5100f53378a7bb185750'
		const { kv, store } = fakeKv({
			'index:viem': JSON.stringify({
				'viem/a.md': {
					id: 'item-viem/a.md',
					etag: 'W/"a1"',
					content_hash: contentHash,
					metadata_hash: EMPTY_METADATA_HASH,
				},
			}),
		})

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [A](/a)' })
			}
			if (url === 'https://viem.sh/a.md') {
				return mockResponse({ body: '# a', etag: 'W/"a2"' })
			}
			throw new Error(`unexpected: ${url}`)
		})

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({
			status: 'synced',
			pages: 0,
			unchanged: 1,
			failed: 0,
		})
		expect(uploads).toHaveLength(0)
		const idx = JSON.parse(store.get('index:viem') ?? '{}')
		expect(idx['viem/a.md']).toEqual({
			id: 'item-viem/a.md',
			etag: 'W/"a2"',
			content_hash: contentHash,
			metadata_hash: EMPTY_METADATA_HASH,
		})
	})

	it('with force=true, does not send If-None-Match on page fetches', async () => {
		const { instance, uploads } = fakeInstance()
		const { kv } = fakeKv({
			'index:viem': JSON.stringify({
				'viem/a.md': { id: 'item-viem/a.md', etag: 'W/"a1"' },
			}),
		})

		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [A](/a)' })
			}
			expect(
				(init?.headers as Record<string, string>)?.['If-None-Match'],
			).toBeUndefined()
			return mockResponse({ body: '# a' })
		})

		await syncSource({
			source: SOURCE,
			instance,
			etagCache: kv,
			force: true,
		})

		expect(uploads).toHaveLength(1)
	})

	it('retries a failed forced sync without reuploading unchanged pages', async () => {
		const { instance, uploads } = fakeInstance()
		const { kv, store } = fakeKv({
			'etag:viem': 'W/"old"',
			'index:viem': JSON.stringify({
				'viem/a.md': {
					id: 'item-viem/a.md',
					etag: 'W/"a1"',
					content_hash:
						'b2e77fbb5f564e2145071c75ac6a7d56478cf3ef696e5100f53378a7bb185750',
					metadata_hash: EMPTY_METADATA_HASH,
				},
				'viem/b.md': { id: 'item-viem/b.md' },
			}),
		})
		let failPage = true
		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [A](/a)\n- [B](/b)', etag: 'W/"new"' })
			}
			if (url === 'https://viem.sh/b.md' && failPage) {
				return mockResponse({ status: 503 })
			}
			return mockResponse({ body: url.endsWith('/a.md') ? '# a' : '# b' })
		})

		expect(
			await syncSource({
				source: SOURCE,
				instance,
				etagCache: kv,
				force: true,
			}),
		).toMatchObject({ status: 'synced', pages: 0, unchanged: 1, failed: 1 })
		expect(uploads).toHaveLength(0)
		expect(store.has('etag:viem')).toBe(false)

		failPage = false
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'synced',
			failed: 0,
		})
		expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ headers: {} })
		expect(uploads.map((upload) => upload.key)).toEqual(['viem/b.md'])
		expect(store.get('etag:viem')).toBe('W/"new"')
	})

	it('keeps page fetches unconditional after a forced upload failure', async () => {
		const { instance, uploads } = fakeInstance()
		vi.spyOn(instance.items, 'upload').mockRejectedValueOnce(
			new Error('upload failed'),
		)
		const { kv, store } = fakeKv({
			'etag:viem': 'W/"old"',
			'index:viem': JSON.stringify({
				'viem/a.md': {
					id: 'item-viem/a.md',
					etag: 'W/"page-old"',
					content_hash:
						'b2e77fbb5f564e2145071c75ac6a7d56478cf3ef696e5100f53378a7bb185750',
					metadata_hash: EMPTY_METADATA_HASH,
				},
			}),
		})
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [A](/a)', etag: 'W/"new"' })
			}
			const headers = init?.headers as Record<string, string>
			return headers['If-None-Match']
				? mockResponse({ status: 304 })
				: mockResponse({ body: '# changed', etag: 'W/"page-old"' })
		})

		expect(
			await syncSource({
				source: SOURCE,
				instance,
				etagCache: kv,
				force: true,
			}),
		).toMatchObject({ failed: 1 })
		expect(store.get('retry_force:viem')).toBe('1')
		expect(store.has('etag:viem')).toBe(false)
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'synced',
			pages: 1,
			failed: 0,
		})
		expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ headers: {} })
		expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ headers: {} })
		expect(uploads.map((upload) => upload.key)).toEqual(['viem/a.md'])
		expect(store.has('retry_force:viem')).toBe(false)
	})

	it.each([
		'updated',
		undefined,
	])('refreshes upload metadata when the source description becomes %s', async (description) => {
		const { instance, uploads } = fakeInstance()
		const { kv } = fakeKv()
		fetchMock.mockImplementation(async (url: string) =>
			url === 'https://viem.sh/llms.txt'
				? mockResponse({ body: '- [A](/a)' })
				: mockResponse({ body: '# a' }),
		)

		await syncSource({
			source: { ...SOURCE, description: 'original' },
			instance,
			etagCache: kv,
		})
		await syncSource({
			source: { ...SOURCE, description },
			instance,
			etagCache: kv,
			force: true,
		})

		expect(uploads).toHaveLength(2)
		expect(uploads[1]?.metadata?.source_description).toBe(description)
	})
})

describe('syncSource — stale-page deletion', () => {
	it.each([
		'item_not_found',
		'AiSearchNotFoundError: item_not_found',
	])('persists the Tempo migration when a stale item is already missing: %s', async (message) => {
		const source = { id: 'tempo', base: 'https://tempo.xyz/developers' }
		const { instance, uploads } = fakeInstance()
		const deleteItem = vi
			.spyOn(instance.items, 'delete')
			.mockRejectedValue(
				Object.assign(new Error(message), { name: 'AiSearchNotFoundError' }),
			)
		const { kv, store } = fakeKv({
			'etag:tempo': 'W/"old"',
			'source_url:tempo': 'https://docs.tempo.xyz/llms.txt',
			'index:tempo': JSON.stringify({
				'tempo/docs_api_mcp.md': { id: 'missing-item' },
			}),
		})
		fetchMock.mockResolvedValueOnce(
			mockResponse({ body: '- [MCP](/docs/api/mcp)', etag: 'W/"new"' }),
		)
		fetchMock.mockResolvedValueOnce(mockResponse({ body: '# MCP' }))

		expect(await syncSource({ source, instance, etagCache: kv })).toMatchObject(
			{
				status: 'synced',
				pages: 1,
				failed: 0,
				deleted: 1,
			},
		)
		expect(deleteItem).toHaveBeenCalledExactlyOnceWith('missing-item')
		expect(console.warn).not.toHaveBeenCalled()
		expect(store.get('etag:tempo')).toBe('W/"new"')
		expect(store.get('source_url:tempo')).toBe(`${source.base}/llms.txt`)
		expect(JSON.parse(store.get('index:tempo') ?? '{}')).toEqual({
			'tempo/developers/docs/api/mcp.md': {
				id: 'item-tempo/developers/docs/api/mcp.md',
				source_url: 'https://tempo.xyz/developers/llms.txt',
				content_hash: expect.any(String),
				metadata_hash: EMPTY_METADATA_HASH,
				index_pending: false,
			},
		})

		fetchMock.mockResolvedValueOnce(mockResponse({ status: 304 }))
		expect(await syncSource({ source, instance, etagCache: kv })).toMatchObject(
			{
				status: 'unchanged',
			},
		)
		expect(fetchMock.mock.lastCall?.[1]).toMatchObject({
			headers: { 'If-None-Match': 'W/"new"' },
		})
		expect(uploads).toHaveLength(1)
		expect(deleteItem).toHaveBeenCalledTimes(1)
	})

	it.each([
		'',
		'- [Off-origin](https://example.com/page)',
	])('preserves all state when the index has no valid pages: %s', async (body) => {
		const { instance, uploads, deletes } = fakeInstance()
		const previous = {
			'etag:viem': 'W/"prev"',
			'index:viem': JSON.stringify({ 'viem/keep.md': { id: 'keep' } }),
			'last_sync:viem': 'previous-sync',
		}
		const { kv, store } = fakeKv(previous)
		fetchMock.mockResolvedValue(mockResponse({ body, etag: 'W/"next"' }))
		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })
		expect(report).toMatchObject({
			status: 'error',
			error: 'index contains no documentation pages',
		})
		expect(uploads).toEqual([])
		expect(deletes).toEqual([])
		expect(Object.fromEntries(store)).toEqual(previous)
	})

	it('re-ingests the migrated Tempo source despite the old index ETag', async () => {
		const source = { id: 'tempo', base: 'https://tempo.xyz/developers' }
		const { instance, uploads } = fakeInstance()
		const { kv, store } = fakeKv({
			'etag:tempo': 'W/"old"',
			'index:tempo': '{}',
		})
		fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
			if (url === `${source.base}/llms.txt`) {
				expect(init?.headers).toEqual({
					accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1',
				})
				return mockResponse({
					body: `- [API Keys](${source.base}/docs/api/api-keys)`,
					etag: 'W/"new"',
				})
			}
			expect(url).toBe(`${source.base}/docs/api/api-keys.md`)
			return mockResponse({ body: '# API Keys\n\nCreate a key.' })
		})
		expect(await syncSource({ source, instance, etagCache: kv })).toMatchObject(
			{ status: 'synced', pages: 1, failed: 0 },
		)
		expect(uploads[0].metadata?.url).toBe(`${source.base}/docs/api/api-keys`)
		expect(store.get('source_url:tempo')).toBe(`${source.base}/llms.txt`)
		fetchMock.mockResolvedValueOnce(mockResponse({ status: 304 }))
		expect(await syncSource({ source, instance, etagCache: kv })).toMatchObject(
			{ status: 'unchanged' },
		)
		expect(fetchMock.mock.lastCall?.[1]).toMatchObject({
			headers: { 'If-None-Match': 'W/"new"' },
		})
	})

	it('deletes items that disappear from llms.txt', async () => {
		const { instance, uploads, deletes } = fakeInstance()
		const { kv, store } = fakeKv({
			'index:viem': JSON.stringify({
				'viem/keep.md': { id: 'item-viem/keep.md' },
				'viem/gone.md': { id: 'item-viem/gone.md' },
			}),
		})

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [Keep](/keep)' })
			}
			return mockResponse({ body: '# keep' })
		})

		const report = await confirmDeletion(instance, kv)

		expect(report).toMatchObject({
			status: 'synced',
			pages: 1,
			deleted: 1,
			failed: 0,
		})
		expect(deletes).toEqual(['item-viem/gone.md'])
		expect(uploads.map((u) => u.key)).toEqual(['viem/keep.md'])

		const idx = JSON.parse(store.get('index:viem') ?? '{}')
		expect(Object.keys(idx)).toEqual(['viem/keep.md'])
	})

	it('preserves pages when a shortened index recovers before confirmation', async () => {
		const { instance, deletes } = fakeInstance()
		const previous = JSON.stringify({
			'viem/keep.md': { id: 'item-viem/keep.md' },
			'viem/gone.md': { id: 'item-viem/gone.md' },
		})
		const { kv, store } = fakeKv({
			'index:viem': previous,
			'etag:viem': 'W/"old"',
		})
		let shortened = true
		fetchMock.mockImplementation(async (url: string) =>
			url === 'https://viem.sh/llms.txt'
				? mockResponse({
						body: shortened
							? '- [Keep](/keep)'
							: '- [Keep](/keep)\n- [Gone](/gone)',
						etag: 'W/"new"',
					})
				: mockResponse({ body: '# Page' }),
		)

		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'pending_deletion',
			removed: 1,
		})
		expect(deletes).toEqual([])
		expect(store.get('etag:viem')).toBe('W/"old"')
		expect(store.get('index:viem')).toBe(previous)
		shortened = false
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'synced',
			deleted: 0,
		})
		expect(deletes).toEqual([])
		expect(store.has('pending_deletion:viem')).toBe(false)
	})

	it('clears an old deletion candidate when the source recovers with 304', async () => {
		const { instance, deletes } = fakeInstance()
		const { kv, store } = fakeKv({
			'etag:viem': 'W/"old"',
			'index:viem': JSON.stringify({
				'viem/keep.md': { id: 'item-viem/keep.md' },
				'viem/gone.md': { id: 'item-viem/gone.md' },
			}),
		})
		const now = vi.spyOn(Date, 'now').mockReturnValue(0)
		fetchMock.mockResolvedValueOnce(mockResponse({ body: '- [Keep](/keep)' }))
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'pending_deletion',
		})
		expect(store.has('pending_deletion:viem')).toBe(true)

		fetchMock.mockResolvedValueOnce(mockResponse({ status: 304 }))
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'unchanged',
		})
		expect(store.has('pending_deletion:viem')).toBe(false)

		now.mockReturnValue(300_001)
		fetchMock.mockResolvedValueOnce(mockResponse({ body: '- [Keep](/keep)' }))
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'pending_deletion',
		})
		expect(deletes).toEqual([])
	})

	it('confirms the same removal set despite added or reordered pages', async () => {
		const { instance, deletes } = fakeInstance()
		const { kv } = fakeKv({
			'index:viem': JSON.stringify({
				'viem/keep.md': { id: 'item-viem/keep.md' },
				'viem/gone.md': { id: 'item-viem/gone.md' },
			}),
		})
		const now = vi.spyOn(Date, 'now').mockReturnValue(0)
		let indexBody = '- [Keep](/keep)'
		fetchMock.mockImplementation(async (url: string) =>
			url === 'https://viem.sh/llms.txt'
				? mockResponse({ body: indexBody })
				: mockResponse({ body: '# Page' }),
		)
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'pending_deletion',
		})
		indexBody = '- [New](/new)\n- [Keep](/keep)'
		now.mockReturnValue(300_001)
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({
			status: 'synced',
			deleted: 1,
		})
		expect(deletes).toEqual(['item-viem/gone.md'])
	})

	it('does NOT delete stale items when any page upload failed', async () => {
		const { instance, deletes } = fakeInstance()
		const { kv, store } = fakeKv({
			'index:viem': JSON.stringify({
				'viem/a.md': { id: 'item-viem/a.md' },
				'viem/old.md': { id: 'item-viem/old.md' },
			}),
		})

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [A](/a)\n- [B](/b)' })
			}
			if (url === 'https://viem.sh/b.md') return mockResponse({ status: 500 })
			return mockResponse({ body: '# a' })
		})

		const report = await confirmDeletion(instance, kv)

		expect(report).toMatchObject({ failed: 1, deleted: 0 })
		expect(deletes).toEqual([])
		// Successful entries advance, but stale entries remain until a clean run.
		expect(JSON.parse(store.get('index:viem') ?? '{}')).toMatchObject({
			'viem/a.md': { id: 'item-viem/a.md' },
			'viem/old.md': { id: 'item-viem/old.md' },
		})
	})

	it.each([
		'network down',
		'AiSearchNotFoundError: ai_search_not_found',
		'AiSearchError: You are being rate limited.',
	])('preserves state for other deletion failures: %s', async (message) => {
		const { instance, deletes } = fakeInstance()
		vi.spyOn(instance.items, 'delete').mockRejectedValue(new Error(message))
		const { kv, store } = fakeKv({
			'etag:viem': 'W/"prev"',
			'index:viem': JSON.stringify({
				'viem/keep.md': { id: 'item-viem/keep.md' },
				'viem/gone.md': { id: 'item-viem/gone.md' },
			}),
		})

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [Keep](/keep)', etag: 'W/"next"' })
			}
			return mockResponse({ body: '# keep' })
		})

		const report = await confirmDeletion(instance, kv)

		expect(report).toMatchObject({ failed: 1, deleted: 0 })
		expect(deletes).toEqual([])
		// Clear the ETag so the next run retries against the preserved index.
		expect(store.has('etag:viem')).toBe(false)
		expect(JSON.parse(store.get('index:viem') ?? '{}')).toMatchObject({
			'viem/gone.md': { id: 'item-viem/gone.md' },
		})
	})
})

describe('syncSource — partial-failure invariants', () => {
	it('keeps the old source ETag when persisting the new index fails', async () => {
		const { instance } = fakeInstance()
		const { kv, store } = fakeKv({ 'etag:viem': 'W/"old"' })
		const originalPut = kv.put.bind(kv)
		kv.put = vi.fn(async (key: string, value: string) => {
			if (key === 'index:viem') throw new Error('KV unavailable')
			return originalPut(key, value)
		}) as KVNamespace['put']
		fetchMock.mockImplementation(async (url: string) =>
			url === 'https://viem.sh/llms.txt'
				? mockResponse({ body: '- [A](/a)', etag: 'W/"new"' })
				: mockResponse({ body: '# A' }),
		)

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({ status: 'error', error: 'KV unavailable' })
		expect(store.get('etag:viem')).toBe('W/"old"')
		expect(JSON.parse(store.get('index:viem') ?? '{}')).toEqual({})
	})

	it('keeps the previous page entry when its fetch fails (so it is not seen as removed)', async () => {
		const { instance, deletes } = fakeInstance()
		const { kv, store } = fakeKv({
			'index:viem': JSON.stringify({
				'viem/a.md': { id: 'item-viem/a.md', etag: 'W/"a1"' },
			}),
		})

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [A](/a)' })
			}
			if (url === 'https://viem.sh/a.md') return mockResponse({ status: 503 })
			throw new Error(`unexpected: ${url}`)
		})

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({ failed: 1, deleted: 0 })
		expect(deletes).toEqual([])
		// The failed page keeps its previous item for retry.
		expect(JSON.parse(store.get('index:viem') ?? '{}')).toMatchObject({
			'viem/a.md': { id: 'item-viem/a.md', etag: 'W/"a1"' },
		})
	})

	it('does NOT advance ETag when any page failed', async () => {
		const { instance } = fakeInstance()
		const { kv, store } = fakeKv()

		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: '- [A](/a)\n- [B](/b)', etag: 'W/"v2"' })
			}
			if (url === 'https://viem.sh/b.md') return mockResponse({ status: 500 })
			return mockResponse({ body: '# page' })
		})

		await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(store.get('etag:viem')).toBeUndefined()
		expect(store.get('last_sync:viem')).toBeTruthy()
	})
})

describe('partial progress and bounded dependencies', () => {
	it.each([
		'http',
		'html',
		'upload',
	])('retains successful pages and retries only failed uploads after %s failure', async (failure) => {
		const { instance, uploads } = fakeInstance()
		const { kv, store } = fakeKv()
		let broken = true
		const upload = instance.items.upload.bind(instance.items)
		vi.spyOn(instance.items, 'upload').mockImplementation((...args) => {
			if (failure === 'upload' && broken && args[0] === 'viem/b.md')
				return Promise.reject(new Error('upload unavailable'))
			return upload(...args)
		})
		fetchMock.mockImplementation(async (url: string) => {
			if (url.endsWith('/llms.txt'))
				return mockResponse({ body: '- [A](/a)\n- [B](/b)', etag: 'index' })
			if (broken && url.endsWith('/b.md')) {
				if (failure === 'http') return mockResponse({ status: 503 })
				if (failure === 'html')
					return mockResponse({
						body: '<html>error</html>',
						contentType: 'text/html',
					})
			}
			return mockResponse({ body: `# ${url}` })
		})
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({ pages: 1, failed: 1 })
		expect(JSON.parse(store.get('index:viem')!)).toHaveProperty('viem/a.md')
		expect(store.has('etag:viem')).toBe(false)
		broken = false
		expect(
			await syncSource({ source: SOURCE, instance, etagCache: kv }),
		).toMatchObject({ pages: 1, unchanged: 1, failed: 0 })
		expect(uploads.map(({ key }) => key)).toEqual(['viem/a.md', 'viem/b.md'])
		expect(store.get('etag:viem')).toBe('index')
	})

	it('preserves partial migration uploads and delays stale deletion until recovery', async () => {
		const source = { id: 'tempo', base: 'https://tempo.xyz/developers' }
		const { instance, uploads, deletes } = fakeInstance()
		const { kv, store } = fakeKv({
			'source_url:tempo': 'https://docs.tempo.xyz/llms.txt',
			'index:tempo': JSON.stringify({ 'tempo/old.md': { id: 'old' } }),
		})
		let broken = true
		fetchMock.mockImplementation(async (url: string) =>
			url.endsWith('/llms.txt')
				? mockResponse({ body: '- [A](/a)\n- [B](/b)' })
				: broken && url.endsWith('/b.md')
					? mockResponse({ status: 503 })
					: mockResponse({ body: '# Page' }),
		)
		expect(await syncSource({ source, instance, etagCache: kv })).toMatchObject(
			{ failed: 1, deleted: 0 },
		)
		expect(JSON.parse(store.get('index:tempo')!)).toHaveProperty('tempo/old.md')
		broken = false
		expect(await syncSource({ source, instance, etagCache: kv })).toMatchObject(
			{ pages: 1, unchanged: 1, failed: 0, deleted: 1 },
		)
		expect(uploads).toHaveLength(2)
		expect(deletes).toEqual(['old'])
		expect(store.get('source_url:tempo')).toBe(
			'https://tempo.xyz/developers/llms.txt',
		)
	})

	it.each([
		'index body',
		'page body',
		'upload',
		'KV',
		'pending item',
	])('bounds a hung %s', async (stage) => {
		vi.useFakeTimers()
		try {
			const { instance } = fakeInstance()
			const { kv } = fakeKv(
				stage === 'pending item'
					? {
							'index:viem': JSON.stringify({
								'viem/a.md': { id: 'a', index_pending: true },
							}),
						}
					: {},
			)
			let stalled = false
			const never = () => {
				stalled = true
				return new Promise<never>(() => {})
			}
			if (stage === 'upload')
				vi.spyOn(instance.items, 'upload').mockImplementation(never)
			if (stage === 'KV') vi.spyOn(kv, 'get').mockImplementation(never)
			if (stage === 'pending item')
				vi.spyOn(instance.items, 'get').mockReturnValue({
					info: never,
				} as unknown as ReturnType<AiSearchInstance['items']['get']>)
			const signals: AbortSignal[] = []
			fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
				signals.push(init.signal!)
				const index = url.endsWith('/llms.txt')
				const response = mockResponse({ body: index ? '- [A](/a)' : '# A' })
				if (stage === (index ? 'index body' : 'page body'))
					response.text = never
				return response
			})
			const pending = syncSource({ source: SOURCE, instance, etagCache: kv })
			await vi.waitFor(() => expect(stalled).toBe(true))
			await vi.advanceTimersByTimeAsync(15_001)
			const report = await pending
			expect(
				report.status === 'error' ||
					('failed' in report && report.failed === 1),
			).toBe(true)
			if (stage.includes('body'))
				expect(signals.some((signal) => signal.aborted)).toBe(true)
			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})

	it('bounds the whole source and persists completed pages before yielding', async () => {
		vi.useFakeTimers()
		try {
			const { instance, uploads } = fakeInstance()
			const { kv, store } = fakeKv()
			fetchMock.mockImplementation(async (url: string) => {
				if (url.endsWith('/llms.txt'))
					return mockResponse({
						body: Array.from({ length: 80 }, (_, i) => `- [Page](/p${i})`).join(
							'\n',
						),
					})
				if (url.endsWith('/p0.md')) return mockResponse({ body: '# Good' })
				return new Promise<never>(() => {})
			})
			const pending = syncSource({ source: SOURCE, instance, etagCache: kv })
			await vi.waitFor(() => expect(uploads).toHaveLength(1))
			await vi.advanceTimersByTimeAsync(90_001)
			expect(await pending).toMatchObject({ pages: 1, failed: 79 })
			expect(uploads).toHaveLength(1)
			expect(JSON.parse(store.get('index:viem')!)).toHaveProperty('viem/p0.md')
			expect(vi.getTimerCount()).toBe(0)
		} finally {
			vi.useRealTimers()
		}
	})
})
