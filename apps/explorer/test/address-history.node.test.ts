import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	fetchAddressHistoryData,
	toEnrichedTransaction,
} from '#lib/server/address-history'

const { getTransactions } = vi.hoisted(() => ({
	getTransactions: vi.fn(),
}))

vi.mock('#lib/server/tempo-api', () => ({
	api: { v1: { transactions: { $get: getTransactions } } },
}))

beforeEach(() => {
	getTransactions.mockReset()
})

const SENDER = '0x286ad6cfc7279c8a6d86d15dcefcb77a65aa7e92'
const RECIPIENT = '0x20c0000000000000000000000000000000000003'
const HASH =
	'0x220935cf5b098cbea4d2b2a72ed3e156ad872743c593869d0223a9b93f06dd48'

function receipt(overrides: Record<string, unknown> = {}) {
	return {
		blockHash: null,
		blockNumber: 21_846_856,
		contractAddress: null,
		cumulativeGasUsed: 52_570,
		effectiveGasPrice: '20000000000',
		feeAmount: '1051',
		feePayer: SENDER,
		feeToken: RECIPIENT,
		gasUsed: 52_570,
		logs: [],
		recipient: RECIPIENT,
		sender: SENDER,
		status: 'success',
		timestamp: '2026-06-12T03:58:20.000Z',
		...overrides,
	}
}

function row(overrides: Record<string, unknown> = {}) {
	return {
		blockHash: null,
		blockNumber: 21_846_856,
		feeToken: RECIPIENT,
		gas: 56_474,
		hash: HASH,
		input: '0x',
		maxFeePerGas: '24000000000',
		maxPriorityFeePerGas: '0',
		meta: { receipt: receipt() },
		nonce: 9_388,
		recipient: RECIPIENT,
		sender: SENDER,
		timestamp: '2026-06-12T03:58:20.000Z',
		transactionIndex: 17,
		type: 'tempo',
		value: '12345',
		...overrides,
	} as never
}

describe('toEnrichedTransaction', () => {
	it('maps a Cadent row + humanized receipt to the UI contract', () => {
		const result = toEnrichedTransaction(row(), {
			includeKnownEvents: false,
			getTokenMetadata: () => undefined,
		})

		expect(result).toEqual({
			hash: HASH,
			blockNumber: '0x14d5b48',
			timestamp: Date.parse('2026-06-12T03:58:20.000Z') / 1000,
			from: '0x286ad6cfc7279C8a6D86D15dcEFcB77A65Aa7E92',
			to: '0x20C0000000000000000000000000000000000003',
			value: '0x3039',
			status: 'success',
			gasUsed: '0xcd5a',
			effectiveGasPrice: '0x4a817c800',
			knownEvents: [],
		})
	})

	it('defaults gas fields and status when the receipt is missing', () => {
		const result = toEnrichedTransaction(row({ meta: {} }), {
			includeKnownEvents: true,
			getTokenMetadata: () => undefined,
		})

		expect(result.status).toBe('success')
		expect(result.gasUsed).toBe('0x0')
		expect(result.effectiveGasPrice).toBe('0x0')
		expect(result.knownEvents).toEqual([])
	})

	it('marks reverted transactions from the receipt status', () => {
		const result = toEnrichedTransaction(
			row({ meta: { receipt: receipt({ status: 'reverted' }) } }),
			{ includeKnownEvents: false, getTokenMetadata: () => undefined },
		)

		expect(result.status).toBe('reverted')
	})
})

describe('fetchAddressHistoryData', () => {
	it('reuses one total count across transaction pages', async () => {
		getTransactions.mockImplementation((options) => {
			const { include } = (options as { query: { include: string } }).query
			return Promise.resolve(
				Response.json(
					include === 'totalCount'
						? {
								data: [],
								meta: { totalCount: 1_750, totalCountCapped: false },
								nextCursor: null,
							}
						: { data: [], nextCursor: 'next' },
				),
			)
		})

		const params = {
			address: '0x1111111111111111111111111111111111111111' as const,
			chainId: 4217,
			includeKnownEvents: false,
			searchParams: {
				include: 'all' as const,
				limit: 100,
				page: 1,
				sort: 'desc' as const,
			},
		}

		await expect(fetchAddressHistoryData(params)).resolves.toMatchObject({
			countCapped: false,
			page: 1,
			total: 1_750,
		})
		for (let page = 2; page <= 18; page++) {
			await expect(
				fetchAddressHistoryData({
					...params,
					searchParams: { ...params.searchParams, page },
				}),
			).resolves.toMatchObject({
				countCapped: false,
				page,
				total: 1_750,
			})
		}

		expect(getTransactions).toHaveBeenCalledTimes(19)
		expect(getTransactions).toHaveBeenNthCalledWith(1, {
			query: {
				address: params.address,
				chainId: '4217',
				include: 'receipt',
				limit: '100',
				order: 'desc',
			},
		})
		expect(getTransactions).toHaveBeenNthCalledWith(2, {
			query: {
				address: params.address,
				chainId: '4217',
				include: 'totalCount',
				limit: '1',
			},
		})
		expect(getTransactions).toHaveBeenLastCalledWith({
			query: {
				address: params.address,
				chainId: '4217',
				include: 'receipt',
				limit: '100',
				order: 'desc',
				page: '18',
			},
		})
		expect(
			getTransactions.mock.calls.filter(
				([options]) =>
					(options as { query: { include: string } }).query.include ===
					'totalCount',
			),
		).toHaveLength(1)
	})
})
