import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncSource } from './ingest.js'
import type { Source } from './sources.js'

const SOURCE: Source = { id: 'viem', base: 'https://viem.sh' }

type UploadCall = {
	key: string
	content: string
	metadata: Record<string, unknown> | undefined
}

/**
 * Fake AI Search instance. Returns deterministic item ids (`item-<key>`) so
 * tests can assert delete-by-id round trips.
 */
function fakeInstance(opts?: { deleteFails?: Set<string> }): {
	instance: AiSearchInstance
	uploads: UploadCall[]
	deletes: string[]
} {
	const uploads: UploadCall[] = []
	const deletes: string[] = []
	const instance = {
		items: {
			uploadAndPoll: async (
				key: string,
				content: string,
				options?: { metadata?: Record<string, unknown> },
			) => {
				uploads.push({ key, content, metadata: options?.metadata })
				return {
					id: `item-${key}`,
					key,
					status: 'completed',
				}
			},
			delete: async (id: string) => {
				if (opts?.deleteFails?.has(id)) throw new Error(`boom: ${id}`)
				deletes.push(id)
			},
		},
	} as unknown as AiSearchInstance
	return { instance, uploads, deletes }
}

function fakeKv(seed?: Record<string, string>) {
	const store = new Map<string, string>(Object.entries(seed ?? {}))
	const kv = {
		get: async (k: string) => store.get(k) ?? null,
		put: async (k: string, v: string) => {
			store.set(k, v)
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
}): Response {
	const status = init.status ?? 200
	const headers = new Headers()
	if (init.etag) headers.set('etag', init.etag)
	return {
		status,
		ok: status >= 200 && status < 300,
		headers,
		text: async () => init.body ?? '',
	} as unknown as Response
}

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
			'viem/docs_bar.md',
			'viem/docs_foo.md',
		])
		for (const u of uploads) {
			expect(u.metadata).toMatchObject({ source: 'viem' })
		}
		expect(store.get('etag:viem')).toBe('W/"new"')
		expect(store.get('last_sync:viem')).toBeTruthy()

		const idx = JSON.parse(store.get('index:viem') ?? '{}')
		expect(Object.keys(idx).sort()).toEqual([
			'viem/docs_bar.md',
			'viem/docs_foo.md',
		])
		expect(idx['viem/docs_bar.md']).toMatchObject({
			id: 'item-viem/docs_bar.md',
		})
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
})

describe('syncSource — stale-page deletion', () => {
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

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

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

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({ failed: 1, deleted: 0 })
		expect(deletes).toEqual([])
		// Index should NOT advance on a partial sync.
		expect(JSON.parse(store.get('index:viem') ?? '{}')).toMatchObject({
			'viem/a.md': { id: 'item-viem/a.md' },
			'viem/old.md': { id: 'item-viem/old.md' },
		})
	})

	it('treats a delete failure as a failed page and aborts state advance', async () => {
		const { instance, deletes } = fakeInstance({
			deleteFails: new Set(['item-viem/gone.md']),
		})
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

		const report = await syncSource({ source: SOURCE, instance, etagCache: kv })

		expect(report).toMatchObject({ failed: 1, deleted: 0 })
		expect(deletes).toEqual([])
		// ETag and index must remain at previous values for retry on next run.
		expect(store.get('etag:viem')).toBe('W/"prev"')
		expect(JSON.parse(store.get('index:viem') ?? '{}')).toMatchObject({
			'viem/gone.md': { id: 'item-viem/gone.md' },
		})
	})
})

describe('syncSource — partial-failure invariants', () => {
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
		// Index is untouched on partial sync.
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
