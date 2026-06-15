import { describe, expect, it, vi } from 'vitest'
import { resolveSearchResults, searchTokens } from '../src/routes/api/search.ts'
import { fetchTransactionTimestamp } from '../src/lib/server/tempo-queries.ts'

vi.mock('../src/lib/server/tempo-queries.ts', () => ({
	fetchLatestBlockNumber: vi.fn(async () => 0n),
	fetchTransactionTimestamp: vi.fn(),
}))

describe('searchTokens', () => {
	it('finds tokenlist-only entries by symbol', () => {
		expect(
			searchTokens('BRLA', 4217, [
				{
					address: '0x20c000000000000000000000f047dd7018e50367',
					name: 'BRLA Token',
					symbol: 'BRLA',
				},
			]),
		).toEqual([
			{
				type: 'token',
				address: '0x20c000000000000000000000f047dd7018e50367',
				symbol: 'BRLA',
				name: 'BRLA Token',
				isTip20: true,
			},
		])
	})
})

describe('resolveSearchResults', () => {
	const hash =
		'0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

	it('returns a transaction match when the hash exists', async () => {
		vi.mocked(fetchTransactionTimestamp).mockResolvedValueOnce(123)

		await expect(resolveSearchResults(hash, 4217, [])).resolves.toEqual([
			{
				type: 'transaction',
				hash,
				timestamp: 123,
			},
		])
	})

	it('does not return a transaction match when the hash lookup fails', async () => {
		vi.mocked(fetchTransactionTimestamp).mockRejectedValueOnce(
			new Error('missing tx'),
		)

		await expect(resolveSearchResults(hash, 4217, [])).resolves.toEqual([])
	})
})
