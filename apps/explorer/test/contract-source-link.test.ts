import { describe, expect, it } from 'vitest'
import type { ContractSourceFile } from '#lib/domain/contract-source'
import {
	createContractSourceLink,
	parseContractSourceLink,
} from '#lib/domain/contract-source-link'

const entries: Array<[string, ContractSourceFile]> = [
	['src/First.sol', { content: 'one\ntwo\nthree' }],
	['lib/a + b/Token.sol', { content: 'one\ntwo\nthree\nfour\nfive' }],
]
const base = 'https://explore.tempo.xyz/address/0x123'

describe('contract source links', () => {
	it('selects a query file and range, including encoded paths', () => {
		const url = new URL(base)
		url.searchParams.set('source', entries[1][0])
		url.searchParams.set('line', '2')
		url.searchParams.set('end', '4')
		expect(parseContractSourceLink(url, entries)).toEqual({
			id: entries[1][0],
			range: { start: 2, end: 4 },
		})
	})

	it.each([
		['?line=2', { start: 2, end: 2 }],
		['?line=3&end=1', { start: 1, end: 3 }],
		['?line=-4&end=999', { start: 1, end: 3 }],
		['?line=2.9', { start: 2, end: 2 }],
		['?line=Infinity&end=NaN', { start: 1, end: 1 }],
		['?line=&end=', { start: 1, end: 1 }],
	])('normalizes line values in %s', (query, range) => {
		expect(parseContractSourceLink(new URL(base + query), entries)).toEqual({
			id: entries[0][0],
			range,
		})
	})

	it('supports file-only links without highlighting', () => {
		expect(
			parseContractSourceLink(new URL(`${base}?source=src/First.sol`), entries),
		).toEqual({ id: entries[0][0], range: null })
	})

	it.each([
		'',
		'?source=missing.sol&line=2',
		'#unknown',
	])('ignores absent or unknown targets: %s', (suffix) => {
		expect(parseContractSourceLink(new URL(base + suffix), entries)).toBeNull()
	})

	it('handles empty source lists', () => {
		expect(parseContractSourceLink(new URL(`${base}?line=1`), [])).toBeNull()
	})

	it('keeps both legacy fragment formats working', () => {
		expect(
			parseContractSourceLink(
				new URL(`${base}#source=src/First.sol&line=2&end=3`),
				entries,
			),
		).toEqual({ id: entries[0][0], range: { start: 2, end: 3 } })
		expect(
			parseContractSourceLink(
				new URL(`${base}#source-file-src-first-sol`),
				entries,
			),
		).toEqual({ id: entries[0][0], range: null })
	})

	it('prefers query selection to stale fragments', () => {
		expect(
			parseContractSourceLink(
				new URL(
					`${base}?source=src/First.sol&line=3#source=missing.sol&line=1`,
				),
				entries,
			),
		).toEqual({ id: entries[0][0], range: { start: 3, end: 3 } })
	})

	it('copies normalized query links and preserves unrelated parameters', () => {
		const original = new URL(`${base}?tab=transactions&limit=10#old`)
		const result = new URL(
			createContractSourceLink(original, {
				id: entries[1][0],
				range: { start: 4, end: 2 },
			}),
		)
		expect(Object.fromEntries(result.searchParams)).toEqual({
			tab: 'contract',
			limit: '10',
			source: entries[1][0],
			line: '2',
			end: '4',
		})
		expect(result.hash).toBe('')
		expect(original.hash).toBe('#old')
		expect(parseContractSourceLink(result, entries)).toEqual({
			id: entries[1][0],
			range: { start: 2, end: 4 },
		})
	})

	it('removes stale ranges for file-only links and omits end for a single line', () => {
		const original = new URL(`${base}?line=2&end=3`)
		const file = new URL(
			createContractSourceLink(original, { id: entries[0][0], range: null }),
		)
		expect(file.searchParams.has('line')).toBe(false)
		expect(file.searchParams.has('end')).toBe(false)
		const single = new URL(
			createContractSourceLink(original, {
				id: entries[0][0],
				range: { start: 2, end: 2 },
			}),
		)
		expect(single.searchParams.get('line')).toBe('2')
		expect(single.searchParams.has('end')).toBe(false)
	})
})
