import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { syncSource } from './ingest.js'
import type { Source } from './sources.js'

const SOURCE: Source = { id: 'viem', base: 'https://viem.sh' }

type UploadCall = {
	key: string
	content: string
	metadata: Record<string, unknown> | undefined
}

function fakeInstance(uploadCalls: UploadCall[]) {
	return {
		items: {
			uploadAndPoll: async (
				key: string,
				content: string,
				options?: { metadata?: Record<string, unknown> },
			) => {
				uploadCalls.push({ key, content, metadata: options?.metadata })
				return { status: 'completed' }
			},
		},
	} as unknown as AiSearchInstance
}

function fakeKv() {
	const store = new Map<string, string>()
	return {
		store,
		kv: {
			get: async (k: string) => store.get(k) ?? null,
			put: async (k: string, v: string) => {
				store.set(k, v)
			},
		} as unknown as KVNamespace,
	}
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
	// Construct directly because the Response constructor rejects 1xx/304/etc.
	return {
		status,
		ok: status >= 200 && status < 300,
		headers,
		text: async () => init.body ?? '',
	} as unknown as Response
}

describe('syncSource', () => {
	it('returns `unchanged` and skips uploads when llms.txt returns 304', async () => {
		const uploads: UploadCall[] = []
		const { kv, store } = fakeKv()
		store.set('etag:viem', 'W/"old"')

		fetchMock.mockResolvedValueOnce(mockResponse({ status: 304 }))

		const report = await syncSource({
			source: SOURCE,
			instance: fakeInstance(uploads),
			etagCache: kv,
		})

		expect(report).toMatchObject({ source: 'viem', status: 'unchanged' })
		expect(report).toHaveProperty('duration_ms')
		expect(uploads).toHaveLength(0)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
			headers: { 'If-None-Match': 'W/"old"' },
		})
	})

	it('uploads each page in llms.txt with source+url metadata', async () => {
		const uploads: UploadCall[] = []
		const { kv, store } = fakeKv()

		const llmsTxt = `
- [Foo](https://viem.sh/docs/foo)
- [Bar](/docs/bar)
`
		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: llmsTxt, etag: 'W/"new"' })
			}
			if (url.endsWith('.md')) {
				return mockResponse({ body: `# Title\n\nBody for ${url}` })
			}
			throw new Error(`unexpected fetch: ${url}`)
		})

		const report = await syncSource({
			source: SOURCE,
			instance: fakeInstance(uploads),
			etagCache: kv,
		})

		expect(report).toMatchObject({
			source: 'viem',
			status: 'synced',
			pages: 2,
			failed: 0,
		})
		expect(uploads).toHaveLength(2)
		expect(uploads.map((u) => u.key).sort()).toEqual([
			'viem/docs_bar.md',
			'viem/docs_foo.md',
		])
		for (const u of uploads) {
			expect(u.metadata).toMatchObject({ source: 'viem' })
			expect(typeof (u.metadata as { url: string }).url).toBe('string')
		}
		expect(store.get('etag:viem')).toBe('W/"new"')
		expect(store.get('last_sync:viem')).toBeTruthy()
	})

	it('counts page-level fetch failures without aborting the source', async () => {
		const uploads: UploadCall[] = []
		const { kv } = fakeKv()

		const llmsTxt = '- [A](/a)\n- [B](/b)\n- [C](/c)'
		fetchMock.mockImplementation(async (url: string) => {
			if (url === 'https://viem.sh/llms.txt') {
				return mockResponse({ body: llmsTxt })
			}
			if (url === 'https://viem.sh/b.md') {
				return mockResponse({ status: 404 })
			}
			return mockResponse({ body: '# page' })
		})

		const report = await syncSource({
			source: SOURCE,
			instance: fakeInstance(uploads),
			etagCache: kv,
		})

		expect(report).toMatchObject({
			source: 'viem',
			status: 'synced',
			pages: 2,
			failed: 1,
		})
		expect(uploads.map((u) => u.key).sort()).toEqual(['viem/a.md', 'viem/c.md'])
	})

	it('returns `error` when the llms.txt index itself errors', async () => {
		const uploads: UploadCall[] = []
		const { kv } = fakeKv()

		fetchMock.mockResolvedValueOnce(mockResponse({ status: 500 }))

		const report = await syncSource({
			source: SOURCE,
			instance: fakeInstance(uploads),
			etagCache: kv,
		})

		expect(report).toMatchObject({
			source: 'viem',
			status: 'error',
			error: 'index 500',
		})
		expect(uploads).toHaveLength(0)
	})

	it('returns `error` when fetch itself throws', async () => {
		const uploads: UploadCall[] = []
		const { kv } = fakeKv()

		fetchMock.mockRejectedValueOnce(new Error('network down'))

		const report = await syncSource({
			source: SOURCE,
			instance: fakeInstance(uploads),
			etagCache: kv,
		})

		expect(report).toMatchObject({
			source: 'viem',
			status: 'error',
			error: 'network down',
		})
	})
})
