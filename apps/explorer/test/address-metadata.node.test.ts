import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	buildAddressTxMetadata,
	fetchAddressTxMetadata,
	pickTip20CreatedTimestamp,
} from '#lib/server/address-metadata'

const { getTransactions } = vi.hoisted(() => ({
	getTransactions: vi.fn(),
}))

vi.mock('#lib/server/tempo-api', () => ({
	api: { v1: { transactions: { $get: getTransactions } } },
}))

beforeEach(() => {
	getTransactions.mockReset()
})

describe('address metadata', () => {
	it('uses the first indexed address activity as creation metadata', () => {
		expect(
			buildAddressTxMetadata({
				count: 3,
				latestTxsBlockTimestamp: 300,
				oldestTxsBlockTimestamp: 100,
				oldestTxHash: '0xoldest',
				oldestTxFrom: '0xsender',
			}),
		).toEqual({
			txCount: 3,
			lastActivityTimestamp: 300,
			createdTimestamp: 100,
			createdTxHash: '0xoldest',
			createdBy: '0xsender',
		})
	})

	it('returns empty activity metadata for a new address', () => {
		expect(buildAddressTxMetadata({ count: 0 })).toEqual({
			txCount: 0,
			lastActivityTimestamp: undefined,
			createdTimestamp: undefined,
			createdTxHash: undefined,
			createdBy: undefined,
		})
	})

	it('loads activity boundaries and count from Tempo API transaction pages', async () => {
		getTransactions
			.mockResolvedValueOnce(
				Response.json({
					data: [
						{
							hash: '0xoldest',
							sender: '0xsender',
							timestamp: '2026-01-01T00:00:00.000Z',
						},
					],
					meta: { totalCount: 3 },
					nextCursor: null,
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					data: [{ timestamp: '2026-01-03T00:00:00.000Z' }],
					nextCursor: null,
				}),
			)

		await expect(
			fetchAddressTxMetadata(
				4217,
				'0x1111111111111111111111111111111111111111',
			),
		).resolves.toEqual({
			count: 3,
			latestTxsBlockTimestamp: '2026-01-03T00:00:00.000Z',
			oldestTxsBlockTimestamp: '2026-01-01T00:00:00.000Z',
			oldestTxHash: '0xoldest',
			oldestTxFrom: '0xsender',
		})
		expect(getTransactions).toHaveBeenNthCalledWith(1, {
			query: {
				address: '0x1111111111111111111111111111111111111111',
				chainId: '4217',
				include: 'totalCount',
				limit: '5',
				order: 'asc',
			},
		})
		expect(getTransactions).toHaveBeenNthCalledWith(2, {
			query: {
				address: '0x1111111111111111111111111111111111111111',
				chainId: '4217',
				limit: '5',
				order: 'desc',
			},
		})
	})
})

describe('pickTip20CreatedTimestamp', () => {
	it('prefers the TokenCreated timestamp when present', () => {
		expect(
			pickTip20CreatedTimestamp({
				tokenCreatedTimestamp: '2026-01-02T00:00:00.000Z',
				firstTransferTimestamp: '2026-01-01T00:00:00.000Z',
			}),
		).toBe(Date.parse('2026-01-02T00:00:00.000Z') / 1000)
	})

	it('falls back to the first transfer timestamp', () => {
		expect(
			pickTip20CreatedTimestamp({
				tokenCreatedTimestamp: undefined,
				firstTransferTimestamp: 200,
			}),
		).toBe(200)
		expect(
			pickTip20CreatedTimestamp({
				tokenCreatedTimestamp: null,
				firstTransferTimestamp: null,
			}),
		).toBeUndefined()
	})
})
