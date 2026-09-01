import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeFunctionData, zeroHash } from 'viem'
import { zonePortalAbi } from '#lib/abis'
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
	it('prioritizes nested Zone calls over indexed activities', () => {
		const portal = '0x5ad0000000000000000000000000000000000003'
		const input = encodeFunctionData({
			abi: zonePortalAbi,
			functionName: 'submitBatch',
			args: [
				1n,
				0n,
				{ prevBlockHash: zeroHash, nextBlockHash: zeroHash },
				{
					prevProcessedHash: zeroHash,
					nextProcessedHash: zeroHash,
					prevDepositNumber: 0n,
					nextDepositNumber: 0n,
				},
				zeroHash,
				'0x',
				'0x',
				1n,
				[],
			],
		})
		const result = toEnrichedTransaction(
			row({
				recipient: portal,
				meta: {
					receipt: receipt({ recipient: portal }),
					rpc: { calls: [{ to: portal, input }] },
				},
			}),
			{
				includeKnownEvents: true,
				getTokenMetadata: () => undefined,
				activities: [
					{
						id: 'nonce',
						title: 'Nonce Incremented',
						type: 'nonce',
						data: {},
					},
				],
			},
		)

		expect(result.knownEvents[0]?.parts[0]).toEqual({
			type: 'action',
			value: 'Submit Zone Batch',
		})
		expect(result.knownEvents).not.toContainEqual(
			expect.objectContaining({ type: 'nonce incremented' }),
		)
	})

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
	it('rejects page sizes above 10', async () => {
		await expect(
			fetchAddressHistoryData({
				address: '0x1111111111111111111111111111111111111111',
				chainId: 4217,
				includeKnownEvents: false,
				searchParams: {
					include: 'all',
					limit: 11,
					sort: 'desc',
				},
			}),
		).rejects.toThrowError('Limit is too high')
		expect(getTransactions).not.toHaveBeenCalled()
	})

	it('requests the total at the latest edge and reuses it on cursor pages', async () => {
		getTransactions.mockImplementation((options) => {
			const { cursor, include } = (
				options as { query: { cursor?: string; include: string } }
			).query
			return Promise.resolve(
				Response.json(
					include.includes('totalCount')
						? {
								data: [],
								meta: { totalCount: 1_750, totalCountCapped: false },
								nextCursor: 'cursor-1',
							}
						: { data: [], nextCursor: cursor ? null : 'cursor-1' },
				),
			)
		})

		const params = {
			address: '0x1111111111111111111111111111111111111111' as const,
			chainId: 4217,
			includeKnownEvents: false,
			searchParams: {
				include: 'all' as const,
				limit: 10,
				sort: 'desc' as const,
			},
		}

		await expect(fetchAddressHistoryData(params)).resolves.toMatchObject({
			countCapped: false,
			nextCursor: 'cursor-1',
			total: 1_750,
		})
		await expect(
			fetchAddressHistoryData({
				...params,
				searchParams: { ...params.searchParams, cursor: 'cursor-1' },
			}),
		).resolves.toMatchObject({
			countCapped: false,
			nextCursor: null,
			total: 1_750,
		})

		expect(getTransactions).toHaveBeenCalledTimes(2)
		expect(getTransactions).toHaveBeenNthCalledWith(1, {
			query: {
				address: params.address,
				chainId: '4217',
				include: 'receipt,totalCount',
				limit: '10',
				order: 'desc',
			},
		})
		expect(getTransactions).toHaveBeenNthCalledWith(2, {
			query: {
				address: params.address,
				chainId: '4217',
				cursor: 'cursor-1',
				include: 'receipt',
				limit: '10',
				order: 'desc',
			},
		})
		expect(
			getTransactions.mock.calls.filter(([options]) =>
				(options as { query: { include: string } }).query.include.includes(
					'totalCount',
				),
			),
		).toHaveLength(1)
	})

	it('fetches and reverses the oldest edge without positional pagination', async () => {
		const olderHash = `0x${'1'.repeat(64)}`
		const oldestHash = `0x${'2'.repeat(64)}`
		getTransactions.mockResolvedValue(
			Response.json({
				data: [
					row({ hash: oldestHash, blockNumber: 1, transactionIndex: 0 }),
					row({ hash: olderHash, blockNumber: 2, transactionIndex: 0 }),
				],
				nextCursor: 'toward-head',
			}),
		)

		await expect(
			fetchAddressHistoryData({
				address: '0x2222222222222222222222222222222222222222',
				chainId: 4217,
				includeKnownEvents: false,
				searchParams: {
					include: 'all',
					limit: 10,
					sort: 'asc',
				},
			}),
		).resolves.toEqual({
			countCapped: false,
			error: null,
			limit: 10,
			nextCursor: 'toward-head',
			reverseCursor: 'WzEsMF0=',
			total: null,
			transactions: [
				expect.objectContaining({ hash: olderHash }),
				expect.objectContaining({ hash: oldestHash }),
			],
		})

		expect(getTransactions).toHaveBeenCalledOnce()
		expect(getTransactions).toHaveBeenCalledWith({
			query: {
				address: '0x2222222222222222222222222222222222222222',
				chainId: '4217',
				include: 'receipt',
				limit: '10',
				order: 'asc',
			},
		})
	})
})
