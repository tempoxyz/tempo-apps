import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	buildAddressTxMetadata,
	fetchAddressTxMetadata,
	getAddressMetadata,
	pickTip20CreatedTimestamp,
} from '#lib/server/address-metadata'

const { getTransactions, getCode, getCreation } = vi.hoisted(() => ({
	getTransactions: vi.fn(),
	getCode: vi.fn(),
	getCreation: vi.fn(),
}))

vi.mock('viem/actions', async (importOriginal) => ({
	...(await importOriginal<typeof import('viem/actions')>()),
	getCode,
}))
vi.mock('#wagmi.config.ts', () => ({
	getBatchedClient: () => ({}),
	getTempoChain: () => ({ id: 4217 }),
}))
vi.mock('#lib/server/contract-creation', () => ({
	fetchContractCreationData: getCreation,
}))
vi.mock('#lib/server/tempo-queries', () => ({}))

vi.mock('#lib/server/tempo-api', () => ({
	api: { v1: { transactions: { $get: getTransactions } } },
}))

beforeEach(() => {
	getTransactions.mockReset()
	getCode.mockReset()
	getCreation.mockReset()
})

describe('contract creation metadata', () => {
	let addressId = 10
	function nextAddress() {
		return `0x${(++addressId).toString(16).padStart(40, '0')}` as const
	}

	beforeEach(() => {
		getCode.mockResolvedValue('0x6000')
		getTransactions.mockImplementation(() =>
			Promise.resolve(
				Response.json({
					data: [{ timestamp: 1791919668, hash: '0xcall', sender: '0xcaller' }],
					meta: { totalCount: 1 },
				}),
			),
		)
	})

	it('uses January deployment even when the only indexed call is in October', async () => {
		getCreation.mockResolvedValue({
			timestamp: 1767225600n,
			hash: '0xdeployment',
			from: '0xdeployer',
		})
		expect(await getAddressMetadata(nextAddress())).toMatchObject({
			accountType: 'contract',
			createdTimestamp: 1767225600,
			createdTxHash: '0xdeployment',
			createdBy: '0xdeployer',
			lastActivityTimestamp: 1791919668,
			txCount: 1,
		})
	})

	it('uses a factory deployment block without inventing a creator or transaction', async () => {
		getCreation.mockResolvedValue({
			timestamp: 1767225600n,
			hash: null,
			from: null,
		})
		expect(await getAddressMetadata(nextAddress())).toMatchObject({
			createdTimestamp: 1767225600,
			createdTxHash: undefined,
			createdBy: undefined,
		})
	})

	it.each([
		'missing',
		'unavailable',
	])('does not substitute activity when deployment is %s', async (reason) => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {})
		if (reason === 'missing') getCreation.mockResolvedValue(null)
		else
			getCreation.mockRejectedValue(new Error('Historical state unavailable'))
		try {
			expect(await getAddressMetadata(nextAddress())).toMatchObject({
				createdTimestamp: undefined,
				createdTxHash: undefined,
				createdBy: undefined,
				lastActivityTimestamp: 1791919668,
			})
		} finally {
			log.mockRestore()
		}
	})

	it.each([
		'0x',
		`0xef0100${'11'.repeat(20)}`,
	])('preserves first activity for non-contract code %s', async (code) => {
		getCode.mockResolvedValue(code)
		expect(await getAddressMetadata(nextAddress())).toMatchObject({
			createdTimestamp: 1791919668,
			createdTxHash: '0xcall',
		})
		expect(getCreation).not.toHaveBeenCalled()
	})
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
