import type { Address, Hex } from 'ox'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetchAddressTxOnlyHistoryPageWithJoins = vi.hoisted(() => vi.fn())

vi.mock('#wagmi.config', () => ({
	getWagmiConfig: () => ({}),
}))

vi.mock('#lib/server/tempo-queries', () => ({
	fetchAddressDirectTxHistoryRows: vi.fn(),
	fetchAddressHistoryTxDetailsByHashes: vi.fn(),
	fetchAddressLogRowsByTxHashes: vi.fn(),
	fetchAddressReceiptRowsByHashes: vi.fn(),
	fetchAddressTransferRowsByTxHashes: vi.fn(),
	fetchAddressTransferEmittedHashes: vi.fn(),
	fetchAddressTransferHashes: vi.fn(),
	fetchAddressTxOnlyHistoryPageWithJoins:
		mockFetchAddressTxOnlyHistoryPageWithJoins,
}))

import { fetchAddressHistoryData } from '#lib/server/address-history'

describe('fetchAddressHistoryData', () => {
	beforeEach(() => {
		mockFetchAddressTxOnlyHistoryPageWithJoins.mockReset()
	})

	it('filters tx-only history by timestamp without pushing after into the TIDX joined query', async () => {
		const address =
			'0x20C0000000000000000000000000000000000000' as Address.Address
		const recentHash = `0x${'a'.repeat(64)}` as Hex.Hex
		const oldHash = `0x${'b'.repeat(64)}` as Hex.Hex

		mockFetchAddressTxOnlyHistoryPageWithJoins.mockResolvedValue({
			hashes: [
				{
					hash: recentHash,
					block_num: 2n,
					from: '0x1111111111111111111111111111111111111111',
					to: address,
					value: 0n,
				},
				{
					hash: oldHash,
					block_num: 1n,
					from: '0x2222222222222222222222222222222222222222',
					to: address,
					value: 0n,
				},
			],
			txRows: [
				{
					hash: recentHash,
					block_num: 2n,
					block_timestamp: 200,
					from: '0x1111111111111111111111111111111111111111',
					to: address,
					value: 0n,
					input: '0x',
					calls: null,
				},
				{
					hash: oldHash,
					block_num: 1n,
					block_timestamp: 100,
					from: '0x2222222222222222222222222222222222222222',
					to: address,
					value: 0n,
					input: '0x',
					calls: null,
				},
			],
			receiptRows: [
				{
					tx_hash: recentHash,
					block_num: 2n,
					block_timestamp: 200,
					from: '0x1111111111111111111111111111111111111111',
					to: address,
					status: 1,
					gas_used: 21_000n,
					effective_gas_price: 2n,
				},
				{
					tx_hash: oldHash,
					block_num: 1n,
					block_timestamp: 100,
					from: '0x2222222222222222222222222222222222222222',
					to: address,
					status: 1,
					gas_used: 21_000n,
					effective_gas_price: 2n,
				},
			],
			logRows: [],
			total: 2,
			countCapped: false,
			hasMore: true,
		})

		const result = await fetchAddressHistoryData({
			address,
			chainId: 1,
			searchParams: {
				offset: 0,
				limit: 10,
				sort: 'desc',
				include: 'all',
				sources: 'txs',
				after: 150,
			},
			includeKnownEvents: false,
		})

		expect(mockFetchAddressTxOnlyHistoryPageWithJoins).toHaveBeenCalledWith(
			expect.objectContaining({ after: undefined }),
		)
		expect(result.transactions.map((transaction) => transaction.hash)).toEqual([
			recentHash,
		])
		expect(result.total).toBe(1)
		expect(result.hasMore).toBe(false)
		expect(result.countCapped).toBe(false)
	})

	it('preserves tx-only pagination when the full page is inside the timestamp window', async () => {
		const address =
			'0x20C0000000000000000000000000000000000000' as Address.Address
		const firstHash = `0x${'c'.repeat(64)}` as Hex.Hex
		const secondHash = `0x${'d'.repeat(64)}` as Hex.Hex

		mockFetchAddressTxOnlyHistoryPageWithJoins.mockResolvedValue({
			hashes: [
				{
					hash: firstHash,
					block_num: 2n,
					from: '0x1111111111111111111111111111111111111111',
					to: address,
					value: 0n,
				},
				{
					hash: secondHash,
					block_num: 1n,
					from: '0x2222222222222222222222222222222222222222',
					to: address,
					value: 0n,
				},
			],
			txRows: [
				{
					hash: firstHash,
					block_num: 2n,
					block_timestamp: 200,
					from: '0x1111111111111111111111111111111111111111',
					to: address,
					value: 0n,
					input: '0x',
					calls: null,
				},
				{
					hash: secondHash,
					block_num: 1n,
					block_timestamp: 190,
					from: '0x2222222222222222222222222222222222222222',
					to: address,
					value: 0n,
					input: '0x',
					calls: null,
				},
			],
			receiptRows: [
				{
					tx_hash: firstHash,
					block_num: 2n,
					block_timestamp: 200,
					from: '0x1111111111111111111111111111111111111111',
					to: address,
					status: 1,
					gas_used: 21_000n,
					effective_gas_price: 2n,
				},
				{
					tx_hash: secondHash,
					block_num: 1n,
					block_timestamp: 190,
					from: '0x2222222222222222222222222222222222222222',
					to: address,
					status: 1,
					gas_used: 21_000n,
					effective_gas_price: 2n,
				},
			],
			logRows: [],
			total: 3,
			countCapped: false,
			hasMore: true,
		})

		const result = await fetchAddressHistoryData({
			address,
			chainId: 1,
			searchParams: {
				offset: 0,
				limit: 2,
				sort: 'desc',
				include: 'all',
				sources: 'txs',
				after: 150,
			},
			includeKnownEvents: false,
		})

		expect(result.transactions.map((transaction) => transaction.hash)).toEqual([
			firstHash,
			secondHash,
		])
		expect(result.hasMore).toBe(true)
	})
})
