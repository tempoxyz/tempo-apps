import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	encodeFunctionData,
	getAbiItem,
	toFunctionSelector,
	zeroHash,
} from 'viem'
import { zonePortalAbi } from '#lib/abis'
import {
	fetchAddressHistoryData,
	RequestParametersSchema,
	toEnrichedTransaction,
} from '#lib/server/address-history'

const { getTransactions, getTransaction, queryIndex } = vi.hoisted(() => ({
	getTransactions: vi.fn(),
	getTransaction: vi.fn(),
	queryIndex: vi.fn(),
}))

vi.mock('#lib/server/tempo-api', () => ({
	api: {
		v1: {
			transactions: {
				$get: getTransactions,
				':transactionHash': { $get: getTransaction },
			},
		},
	},
}))

vi.mock('#lib/server/tempo-queries-provider', () => ({
	tidx: { fetch: queryIndex },
}))

beforeEach(() => {
	getTransactions.mockReset()
	queryIndex.mockReset()
	getTransaction.mockReset()
	getTransaction.mockImplementation(({ param }) =>
		Promise.resolve(Response.json(row({ hash: param.transactionHash }))),
	)
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
	const portal = '0x5ad0000000000000000000000000000000000001'
	const batchInput = toFunctionSelector(
		getAbiItem({ abi: zonePortalAbi, name: 'submitBatch' }),
	)
	const filteredParams = {
		address: portal,
		chainId: 4217,
		includeKnownEvents: false,
		searchParams: {
			include: 'all',
			limit: 2,
			sort: 'desc',
			hideSubmitBatches: 'true',
		},
	} as const

	it('parses explicit filter booleans without treating false as true', () => {
		expect(
			RequestParametersSchema.parse({ hideSubmitBatches: 'false' })
				.hideSubmitBatches,
		).toBe('false')
		expect(
			RequestParametersSchema.safeParse({ hideSubmitBatches: 'yes' }).success,
		).toBe(false)
	})

	it('queries matching hashes before hydrating only the visible page', async () => {
		const hashes = [1, 2, 3].map((n) => `0x${String(n).repeat(64)}`)
		queryIndex
			.mockResolvedValueOnce({
				rows: [{ hash: hashes[1], block_num: 8, idx: 0 }],
			})
			.mockResolvedValueOnce({
				rows: hashes.map((hash, i) => ({ hash, block_num: 9 - i, idx: 0 })),
			})
		const result = await fetchAddressHistoryData(filteredParams)
		expect(result.transactions.map((tx) => tx.hash)).toEqual(hashes.slice(0, 2))
		expect(result.nextCursor).toBe(btoa(JSON.stringify([8, 0])))
		expect(result.reverseCursor).toBe(btoa(JSON.stringify([9, 0])))
		expect(result.total).toBeNull()
		expect(getTransactions).not.toHaveBeenCalled()
		expect(getTransaction).toHaveBeenCalledTimes(2)
		expect(getTransaction).toHaveBeenCalledWith({
			param: { transactionHash: hashes[0] },
			query: { chainId: '4217', include: 'receipt' },
		})
		expect(queryIndex.mock.calls[0]?.[0].query).toContain(
			`t."from" = '${portal}'`,
		)
		expect(queryIndex.mock.calls[1]?.[0].query).toContain(
			`t."to" = '${portal}'`,
		)
		for (const [options] of queryIndex.mock.calls) {
			expect(options.query).toContain('LIMIT 3')
			expect(options.query).toContain("t.calls::jsonb @? '$[*]")
			expect(options.query).not.toContain('jsonb_array_elements')
			expect(options.query).toContain(batchInput)
			expect(options.query).toContain('IS NOT TRUE')
		}
	})

	it('keeps status, direction, period and ascending cursor filters in the indexed query', async () => {
		const hashes = [1, 2].map((n) => `0x${String(n).repeat(64)}`)
		queryIndex.mockResolvedValue({
			rows: hashes.map((hash, i) => ({ hash, block_num: i + 2, idx: 0 })),
		})
		const result = await fetchAddressHistoryData({
			...filteredParams,
			searchParams: {
				...filteredParams.searchParams,
				sort: 'asc',
				cursor: btoa('[1,0]'),
				include: 'received',
				status: 'reverted',
				after: 1,
			},
		})
		expect(result.transactions.map((tx) => tx.hash)).toEqual(
			[...hashes].reverse(),
		)
		expect(result.nextCursor).toBeNull()
		expect(queryIndex).toHaveBeenCalledTimes(1)
		const query = queryIndex.mock.calls[0]?.[0].query
		expect(query).toContain('JOIN receipts AS r ON r.tx_hash = t.hash')
		expect(query).toContain('r.status = 0')
		expect(query).toContain('(t.block_num, t.idx) > (1, 0)')
		expect(query).toContain("t.block_timestamp >= '1970-01-01T00:00:01.000Z'")
		expect(query).toContain('ORDER BY t.block_num + 0 ASC, t.idx ASC')
	})

	it('returns an exhausted page without hydrating discarded batches', async () => {
		queryIndex.mockResolvedValue({ rows: [] })
		await expect(
			fetchAddressHistoryData(filteredParams),
		).resolves.toMatchObject({
			transactions: [],
			nextCursor: null,
			reverseCursor: null,
			total: null,
		})
		expect(getTransaction).not.toHaveBeenCalled()
		expect(getTransactions).not.toHaveBeenCalled()
	})

	it.each([
		'invalid',
		btoa('["1",0]'),
		btoa('[-1,0]'),
		btoa('[1.5,0]'),
		btoa('[9007199254740992,0]'),
	])('rejects malformed cursors before querying: %s', async (cursor) => {
		await expect(
			fetchAddressHistoryData({
				...filteredParams,
				searchParams: { ...filteredParams.searchParams, cursor },
			}),
		).rejects.toThrow()
		expect(queryIndex).not.toHaveBeenCalled()
	})

	it.each([
		undefined,
		'false',
	] as const)('leaves unfiltered history unchanged for %s', async (hideSubmitBatches) => {
		getTransactions.mockResolvedValue(
			Response.json({
				data: [row({ recipient: portal, input: batchInput })],
				nextCursor: null,
			}),
		)
		const result = await fetchAddressHistoryData({
			...filteredParams,
			searchParams: { ...filteredParams.searchParams, hideSubmitBatches },
		})
		expect(result.transactions).toHaveLength(1)
		expect(getTransactions.mock.calls[0]?.[0].query.limit).toBe('2')
	})

	it('ignores the portal-specific filter on other addresses', async () => {
		getTransactions.mockResolvedValue(
			Response.json({ data: [row()], nextCursor: null }),
		)
		await fetchAddressHistoryData({ ...filteredParams, address: RECIPIENT })
		expect(getTransactions.mock.calls[0]?.[0].query.limit).toBe('2')
	})

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
