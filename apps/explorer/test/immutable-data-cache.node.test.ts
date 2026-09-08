import { afterEach, describe, expect, it, vi } from 'vitest'
import { withImmutableDataCache } from '../src/lib/server/immutable-data-cache'

function mockCache() {
	const entries = new Map<string, Response>()
	const cache = {
		delete: vi.fn(async (request: Request) => entries.delete(request.url)),
		match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
		put: vi.fn(async (request: Request, response: Response) => {
			entries.set(request.url, response.clone())
		}),
	}

	vi.stubGlobal('caches', { default: cache })
	return cache
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('withImmutableDataCache', () => {
	it('caches values and preserves bigint fields', async () => {
		const cache = mockCache()
		const load = vi.fn(async () => ({ blockNumber: 37_704_533n }))

		await expect(
			withImmutableDataCache({ key: 'receipt:1', load }),
		).resolves.toEqual({ blockNumber: 37_704_533n })
		await expect(
			withImmutableDataCache({ key: 'receipt:1', load }),
		).resolves.toEqual({ blockNumber: 37_704_533n })

		expect(load).toHaveBeenCalledOnce()
		expect(cache.put).toHaveBeenCalledOnce()
	})

	it('returns fresh data when the cache is unavailable', async () => {
		const cache = mockCache()
		cache.match.mockRejectedValueOnce(new Error('cache unavailable'))
		cache.put.mockRejectedValueOnce(new Error('cache unavailable'))

		await expect(
			withImmutableDataCache({
				key: 'receipt:3',
				load: async () => ({ status: 'success' }),
			}),
		).resolves.toEqual({ status: 'success' })
	})

	it('does not cache values rejected by shouldCache', async () => {
		const cache = mockCache()
		const load = vi.fn(async () => ({ trace: null }))

		await expect(
			withImmutableDataCache({
				key: 'trace:1',
				load,
				shouldCache: (data) => data.trace !== null,
			}),
		).resolves.toEqual({ trace: null })
		await expect(
			withImmutableDataCache({
				key: 'trace:1',
				load,
				shouldCache: (data) => data.trace !== null,
			}),
		).resolves.toEqual({ trace: null })

		expect(load).toHaveBeenCalledTimes(2)
		expect(cache.put).not.toHaveBeenCalled()
	})
})
