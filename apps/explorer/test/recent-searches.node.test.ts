import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	loadRecentSearches,
	persistRecentSearches,
	recentSearchLabel,
	removeRecentSearch,
} from '#lib/recent-searches'
import type { SearchResult } from '#routes/api/search'

const key = 'tempo-explorer-recent-searches'
const block: SearchResult = { type: 'block', blockNumber: 100 }
const address: SearchResult = {
	type: 'address',
	address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	isTip20: false,
}
const token: SearchResult = {
	...address,
	type: 'token',
	name: 'Dollar',
	symbol: 'USD',
}
const tx: SearchResult = { type: 'transaction', hash: `0x${'ab'.repeat(32)}` }
function storage() {
	const values = new Map<string, string>([['unrelated', 'keep']])
	const localStorage = {
		getItem: (name: string) => values.get(name) ?? null,
		setItem: (name: string, value: string) => {
			values.set(name, value)
		},
		removeItem: (name: string) => {
			values.delete(name)
		},
	}
	vi.stubGlobal('window', { localStorage })
	return { values, localStorage }
}
afterEach(() => vi.unstubAllGlobals())

describe('removing recent searches', () => {
	it('removes the target and preserves order and metadata without mutating history', () => {
		const history = [block, address, token, tx]
		expect(removeRecentSearch(history, address)).toEqual([block, token, tx])
		expect(history).toEqual([block, address, token, tx])
	})
	it('uses case-insensitive address identity while retaining token at same address', () => {
		expect(
			removeRecentSearch([block, address, token], {
				...address,
				address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
			}),
		).toEqual([block, token])
	})
	it('uses case-insensitive transaction identity', () => {
		expect(
			removeRecentSearch([tx, block], {
				type: 'transaction',
				hash: `0x${'AB'.repeat(32)}`,
			}),
		).toEqual([block])
	})
	it('removing a missing entry is harmless', () => {
		expect(removeRecentSearch([address, tx], block)).toEqual([address, tx])
	})
	it('removes last entry and every duplicate of the same identity', () => {
		expect(removeRecentSearch([block, block, tx], block)).toEqual([tx])
		expect(removeRecentSearch([block], block)).toEqual([])
	})
	it('persists removal through reload without modifying other keys', () => {
		const { values } = storage()
		persistRecentSearches([block, address, token, tx])
		persistRecentSearches(removeRecentSearch(loadRecentSearches(), address))
		expect(loadRecentSearches()).toEqual([block, token, tx])
		expect(values.get('unrelated')).toBe('keep')
	})
	it('clears storage after removing the last item', () => {
		const { values } = storage()
		persistRecentSearches([block])
		expect(loadRecentSearches()).toEqual([block])
		persistRecentSearches(removeRecentSearch(loadRecentSearches(), block))
		expect(values.has(key)).toBe(false)
		expect(loadRecentSearches()).toEqual([])
		expect(values.get('unrelated')).toBe('keep')
	})
	it('keeps the current result usable when storage writes fail', () => {
		const { localStorage } = storage()
		persistRecentSearches([block, address])
		localStorage.setItem = () => {
			throw new Error('quota')
		}
		const remaining = removeRecentSearch(loadRecentSearches(), block)
		persistRecentSearches(remaining)
		expect(remaining).toEqual([address])
		expect(loadRecentSearches()).toEqual([block, address])
	})
	it('tolerates failed storage removal', () => {
		const { localStorage } = storage()
		persistRecentSearches([block])
		localStorage.removeItem = () => {
			throw new Error('denied')
		}
		persistRecentSearches([])
		expect(loadRecentSearches()).toEqual([block])
	})
	it('filters invalid persisted records and preserves valid ones', () => {
		const { values } = storage()
		values.set(
			key,
			JSON.stringify([
				null,
				{},
				{ type: 'block', blockNumber: -1 },
				address,
				token,
				tx,
				block,
			]),
		)
		expect(loadRecentSearches()).toEqual([address, token, tx, block])
	})
	it('handles invalid JSON, non-array data and missing history', () => {
		const { values } = storage()
		persistRecentSearches([block])
		expect(loadRecentSearches()).toEqual([block])
		for (const raw of ['{', '{}', 'null']) {
			values.set(key, raw)
			expect(loadRecentSearches()).toEqual([])
		}
		values.delete(key)
		expect(loadRecentSearches()).toEqual([])
	})
	it('handles blocked storage access and server rendering', () => {
		vi.stubGlobal('window', {
			get localStorage() {
				throw new Error('denied')
			},
		})
		persistRecentSearches([block])
		expect(loadRecentSearches()).toEqual([])
		vi.stubGlobal('window', undefined)
		persistRecentSearches([block])
		expect(loadRecentSearches()).toEqual([])
		storage()
		persistRecentSearches([block])
		expect(loadRecentSearches()).toEqual([block])
	})
	it('retains the existing six-item bound', () => {
		storage()
		persistRecentSearches(
			Array.from({ length: 8 }, (_, blockNumber) => ({
				type: 'block',
				blockNumber,
			})),
		)
		expect(loadRecentSearches()).toEqual(
			[0, 1, 2, 3, 4, 5].map((blockNumber) => ({ type: 'block', blockNumber })),
		)
	})
	it('names removal actions with type and unambiguous identity', () => {
		expect(recentSearchLabel(block)).toBe('block #100')
		expect(recentSearchLabel(address)).toBe(
			'address 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		)
		expect(recentSearchLabel(token)).toBe(
			'token Dollar (USD), 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		)
		expect(recentSearchLabel(tx)).toBe(`transaction 0x${'ab'.repeat(32)}`)
	})
})
