import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchInstance } from './search-instance.js'

const sources = ['a', 'b'].map((id) => ({
	id,
	base: `https://${id}.example`,
	instanceId: `docs-${id}`,
}))
const chunk = (key: string, score = 0.5) => ({
	id: key,
	type: 'text' as const,
	text: key,
	score,
	item: { key },
})
afterEach(() => {
	vi.restoreAllMocks()
	vi.useRealTimers()
})

function namespace(
	responses: Record<string, () => Promise<AiSearchSearchResponse>>,
) {
	const get = vi.fn(
		(id: string) => ({ search: responses[id] }) as AiSearchInstance,
	)
	return { get }
}
const response =
	(...chunks: ReturnType<typeof chunk>[]) =>
	async () => ({ search_query: 'test', chunks })

describe('independent indexes', () => {
	it.each([
		'empty',
		'failed',
	])('retains healthy results and consults legacy for an %s source', async (mode) => {
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		const ns = namespace({
			'docs-a': response(chunk('a/page')),
			'docs-b':
				mode === 'empty'
					? response()
					: async () => {
							throw new Error('unavailable')
						},
			legacy: response(chunk('b/page'), chunk('a/page', 0.8)),
		})
		const result = await searchInstance(ns, 'legacy', sources, []).search({
			query: 'test',
		})
		expect(result.chunks.map((c) => c.item?.key)).toEqual(['a/page', 'b/page'])
		expect(result.chunks[0].score).toBe(0.8)
		expect(ns.get.mock.calls.flat()).toEqual(['docs-a', 'docs-b', 'legacy'])
	})
	it('queries only requested sources plus legacy during migration', async () => {
		const ns = namespace({
			'docs-b': response(chunk('b/page')),
			legacy: response(),
		})
		await searchInstance(ns, 'legacy', sources, ['b']).search({ query: 'test' })
		expect(ns.get.mock.calls.flat()).toEqual(['docs-b', 'legacy'])
	})
	it('deduplicates shared legacy destinations', async () => {
		const ns = namespace({ legacy: response(chunk('a/page')) })
		await searchInstance(
			ns,
			'legacy',
			sources.map(({ instanceId: _, ...source }) => source),
			[],
		).search({ query: 'test' })
		expect(ns.get).toHaveBeenCalledTimes(1)
	})
	it('times out a stuck index without losing healthy results', async () => {
		vi.useFakeTimers()
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		const ns = namespace({
			'docs-a': response(chunk('a/page')),
			'docs-b': () => new Promise(() => {}),
			legacy: response(),
		})
		const pending = searchInstance(ns, 'legacy', sources, []).search({
			query: 'test',
		})
		await vi.advanceTimersByTimeAsync(4001)
		expect((await pending).chunks).toHaveLength(1)
		expect(vi.getTimerCount()).toBe(0)
	})
	it('throws when every index fails so source-page fallback can run', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		const fail = async () => {
			throw new Error('unavailable')
		}
		const ns = namespace({ 'docs-a': fail, 'docs-b': fail, legacy: fail })
		await expect(
			searchInstance(ns, 'legacy', sources, []).search({ query: 'test' }),
		).rejects.toThrow('All selected')
	})
})
