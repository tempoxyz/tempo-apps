import type { Address, Hex } from 'ox'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryBuilder = vi.hoisted(() => {
	class MockQueryBuilder {
		private responses: unknown[] = []

		setResponses(responses: unknown[]): void {
			this.responses = [...responses]
		}

		reset(): void {
			this.responses = []
		}

		withSignatures(): this {
			return this
		}

		selectFrom(): this {
			return this
		}

		select(): this {
			return this
		}

		where(): this {
			return this
		}

		groupBy(): this {
			return this
		}

		orderBy(): this {
			return this
		}

		limit(): this {
			return this
		}

		offset(): this {
			return this
		}

		distinct(): this {
			return this
		}

		as(): this {
			return this
		}

		async execute(): Promise<unknown> {
			return this.nextResponse()
		}

		async executeTakeFirst(): Promise<unknown> {
			return this.nextResponse()
		}

		async executeTakeFirstOrThrow(): Promise<unknown> {
			const response = this.nextResponse()
			if (response == null) {
				throw new Error('Missing mock response')
			}
			return response
		}

		private nextResponse(): unknown {
			if (this.responses.length === 0) {
				throw new Error('No mock responses queued')
			}
			return this.responses.shift()
		}
	}

	return new MockQueryBuilder()
})

vi.mock('#lib/server/tempo-queries-provider', () => ({
	tempoQueryBuilder: mockQueryBuilder,
}))

import {
	fetchAddressDirectTxCountRows,
	fetchAddressDirectTxHashes,
	fetchAddressDirectTxHistoryRows,
	fetchAddressTransferActivity,
	fetchAddressTransferBalances,
	fetchAddressTransferCountRows,
	fetchAddressTransferEmittedCountRows,
	fetchAddressTransferEmittedHashes,
	fetchAddressTransferHashes,
	fetchAddressTransfersForValue,
	fetchAddressTxAggregate,
	fetchAddressTxCounts,
	fetchBasicTxDataByHashes,
	fetchContractCreationTxCandidates,
	fetchLatestBlockNumber,
	fetchTokenCreatedCount,
	fetchTokenCreatedMetadata,
	fetchTokenCreatedRows,
	fetchTokenFirstTransferTimestamp,
	fetchTokenHolderBalances,
	fetchTokenTransferCount,
	fetchTokenTransfers,
	fetchTransactionTimestamp,
	fetchTxDataByHashes,
} from '#lib/server/tempo-queries'

describe('tempo-queries', () => {
	beforeEach(() => {
		mockQueryBuilder.reset()
	})

	it('fetchTokenFirstTransferTimestamp returns a timestamp', async () => {
		mockQueryBuilder.setResponses([
			{
				block_timestamp: '123',
			},
		])

		await expect(
			fetchTokenFirstTransferTimestamp('0xToken' as Address.Address, 1),
		).resolves.toBe(123)
	})

	it('fetchTokenFirstTransferTimestamp returns null when missing', async () => {
		mockQueryBuilder.setResponses([null])

		await expect(
			fetchTokenFirstTransferTimestamp('0xToken' as Address.Address, 1),
		).resolves.toBeNull()
	})

	it('fetchTokenTransfers maps transfer rows into typed results', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					from: '0x1111',
					to: '0x2222',
					tokens: '10',
					tx_hash: '0xabc' as Hex.Hex,
					block_num: 5,
					log_idx: 1,
					block_timestamp: '123',
				},
			],
		])

		const transfers = await fetchTokenTransfers(
			'0xToken' as Address.Address,
			1,
			1,
			0,
		)

		expect(transfers).toEqual([
			{
				from: '0x1111',
				to: '0x2222',
				tokens: 10n,
				tx_hash: '0xabc',
				block_num: 5,
				log_idx: 1,
				block_timestamp: '123',
			},
		])
	})

	it('fetchTokenTransferCount flags when the count is capped', async () => {
		mockQueryBuilder.setResponses([
			{
				count: 3,
			},
		])

		await expect(
			fetchTokenTransferCount('0xToken' as Address.Address, 1, 2),
		).resolves.toEqual({ count: 3, capped: true })
	})

	it('fetchTokenCreatedRows returns the token creation rows', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					token: '0xToken' as Address.Address,
					symbol: 'TOK',
					name: 'Token',
					currency: 'USD',
					block_timestamp: '999',
				},
			],
		])

		await expect(fetchTokenCreatedRows(1, 1, 0)).resolves.toEqual([
			{
				token: '0xToken',
				symbol: 'TOK',
				name: 'Token',
				currency: 'USD',
				block_timestamp: '999',
			},
		])
	})

	it('fetchTokenCreatedCount returns the counted total', async () => {
		mockQueryBuilder.setResponses([{ count: 42 }])

		await expect(fetchTokenCreatedCount(1, 100)).resolves.toBe(42)
	})

	it('fetchTokenCreatedMetadata returns empty when no tokens are provided', async () => {
		await expect(fetchTokenCreatedMetadata(1, [])).resolves.toEqual([])
	})

	it('fetchTokenCreatedMetadata returns metadata rows', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					token: '0xToken',
					name: 'Token',
					symbol: 'TOK',
					currency: 'USD',
				},
			],
		])

		await expect(
			fetchTokenCreatedMetadata(1, ['0xToken' as Address.Address]),
		).resolves.toEqual([
			{
				token: '0xToken',
				name: 'Token',
				symbol: 'TOK',
				currency: 'USD',
			},
		])
	})

	it('fetchTransactionTimestamp returns a timestamp when present', async () => {
		mockQueryBuilder.setResponses([
			{
				block_timestamp: '456',
			},
		])

		await expect(
			fetchTransactionTimestamp(1, '0xHash' as Hex.Hex),
		).resolves.toBe(456)
	})

	it('fetchTransactionTimestamp returns undefined when missing', async () => {
		mockQueryBuilder.setResponses([null])

		await expect(
			fetchTransactionTimestamp(1, '0xHash' as Hex.Hex),
		).resolves.toBeUndefined()
	})

	it('fetchLatestBlockNumber returns a bigint from the latest block row', async () => {
		mockQueryBuilder.setResponses([{ num: 123 }])

		await expect(fetchLatestBlockNumber(1)).resolves.toBe(123n)
	})

	it('fetchLatestBlockNumber throws when no rows are returned', async () => {
		mockQueryBuilder.setResponses([null])

		await expect(fetchLatestBlockNumber(1)).rejects.toThrow(
			'Missing mock response',
		)
	})

	it('fetchTokenHolderBalances aggregates incoming and outgoing balances', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					holder: '0x1111',
					sent: '5',
				},
			],
			[
				{
					holder: '0x1111',
					received: '10',
				},
				{
					holder: '0x2222',
					received: '3',
				},
			],
		])

		const balances = await fetchTokenHolderBalances(
			'0xToken' as Address.Address,
			1,
		)

		expect(balances).toEqual([
			{ address: '0x1111', balance: 5n },
			{ address: '0x2222', balance: 3n },
		])
	})

	it('fetchAddressDirectTxHashes returns hash rows', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					hash: '0xabc' as Hex.Hex,
					block_num: 12n,
				},
			],
		])

		await expect(
			fetchAddressDirectTxHashes({
				address: '0x1111' as Address.Address,
				chainId: 1,
				includeSent: true,
				includeReceived: true,
				sortDirection: 'desc',
				limit: 5,
			}),
		).resolves.toEqual([
			{
				hash: '0xabc',
				block_num: 12n,
			},
		])
	})

	it('fetchAddressDirectTxHistoryRows returns history rows', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					hash: '0xabc' as Hex.Hex,
					block_num: 12n,
					from: '0x1111',
					to: '0x2222',
					value: 50n,
				},
			],
		])

		await expect(
			fetchAddressDirectTxHistoryRows({
				address: '0x1111' as Address.Address,
				chainId: 1,
				includeSent: true,
				includeReceived: false,
				sortDirection: 'desc',
				limit: 5,
			}),
		).resolves.toEqual([
			{
				hash: '0xabc',
				block_num: 12n,
				from: '0x1111',
				to: '0x2222',
				value: 50n,
			},
		])
	})

	it('fetchAddressTransferHashes returns transfer hashes', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					tx_hash: '0xabc' as Hex.Hex,
					block_num: 10n,
				},
			],
		])

		await expect(
			fetchAddressTransferHashes({
				address: '0x1111' as Address.Address,
				chainId: 1,
				includeSent: true,
				includeReceived: true,
				sortDirection: 'asc',
				limit: 2,
			}),
		).resolves.toEqual([
			{
				tx_hash: '0xabc',
				block_num: 10n,
			},
		])
	})

	it('fetchAddressTransferEmittedHashes returns emitted transfer hashes', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					tx_hash: '0xdef' as Hex.Hex,
					block_num: 11n,
				},
			],
		])

		await expect(
			fetchAddressTransferEmittedHashes({
				address: '0xToken' as Address.Address,
				chainId: 1,
				sortDirection: 'desc',
				limit: 1,
			}),
		).resolves.toEqual([
			{
				tx_hash: '0xdef',
				block_num: 11n,
			},
		])
	})

	it('fetchAddressDirectTxCountRows returns count rows', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					hash: '0xaaa' as Hex.Hex,
				},
			],
		])

		await expect(
			fetchAddressDirectTxCountRows({
				address: '0x1111' as Address.Address,
				chainId: 1,
				includeSent: false,
				includeReceived: true,
				limit: 10,
			}),
		).resolves.toEqual([
			{
				hash: '0xaaa',
			},
		])
	})

	it('fetchAddressTransferCountRows returns transfer count rows', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					hash: '0xbb' as Hex.Hex,
				},
			],
		])

		await expect(
			fetchAddressTransferCountRows({
				address: '0x1111' as Address.Address,
				chainId: 1,
				includeSent: true,
				includeReceived: false,
				limit: 10,
			}),
		).resolves.toEqual([
			{
				hash: '0xbb',
			},
		])
	})

	it('fetchAddressTransferEmittedCountRows returns emitted count rows', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					hash: '0xcc' as Hex.Hex,
				},
			],
		])

		await expect(
			fetchAddressTransferEmittedCountRows({
				address: '0xToken' as Address.Address,
				chainId: 1,
				limit: 3,
			}),
		).resolves.toEqual([
			{
				hash: '0xcc',
			},
		])
	})

	it('fetchTxDataByHashes returns empty when no hashes provided', async () => {
		await expect(fetchTxDataByHashes(1, [])).resolves.toEqual([])
	})

	it('fetchTxDataByHashes returns tx rows', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					hash: '0xabc' as Hex.Hex,
					block_num: 1n,
					from: '0x1111',
					to: '0x2222',
					value: 5n,
					input: '0x00' as Hex.Hex,
					nonce: 1n,
					gas: 21000n,
					gas_price: 1n,
					type: 0n,
				},
			],
		])

		await expect(fetchTxDataByHashes(1, ['0xabc' as Hex.Hex])).resolves.toEqual(
			[
				{
					hash: '0xabc',
					block_num: 1n,
					from: '0x1111',
					to: '0x2222',
					value: 5n,
					input: '0x00',
					nonce: 1n,
					gas: 21000n,
					gas_price: 1n,
					type: 0n,
				},
			],
		)
	})

	it('fetchBasicTxDataByHashes returns empty when no hashes provided', async () => {
		await expect(fetchBasicTxDataByHashes(1, [])).resolves.toEqual([])
	})

	it('fetchBasicTxDataByHashes returns basic tx rows', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					hash: '0xabc' as Hex.Hex,
					from: '0x1111',
					to: '0x2222',
					value: 8n,
				},
			],
		])

		await expect(
			fetchBasicTxDataByHashes(1, ['0xabc' as Hex.Hex]),
		).resolves.toEqual([
			{
				hash: '0xabc',
				from: '0x1111',
				to: '0x2222',
				value: 8n,
			},
		])
	})

	it('fetchContractCreationTxCandidates returns candidate rows', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					hash: '0xabc' as Hex.Hex,
					block_num: 99n,
				},
			],
		])

		await expect(fetchContractCreationTxCandidates(1, 99n)).resolves.toEqual([
			{
				hash: '0xabc',
				block_num: 99n,
			},
		])
	})

	it('fetchAddressTransferBalances returns aggregated balances', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					token: '0xToken',
					received: '10',
					sent: '2',
				},
			],
		])

		await expect(
			fetchAddressTransferBalances('0x1111' as Address.Address, 1),
		).resolves.toEqual([
			{
				token: '0xToken',
				received: '10',
				sent: '2',
			},
		])
	})

	it('fetchAddressTransfersForValue returns transfers', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					address: '0xToken',
					from: '0x1111',
					to: '0x2222',
					tokens: '5',
				},
			],
		])

		await expect(
			fetchAddressTransfersForValue('0x1111' as Address.Address, 1, 1),
		).resolves.toEqual([
			{
				address: '0xToken',
				from: '0x1111',
				to: '0x2222',
				tokens: '5',
			},
		])
	})

	it('fetchAddressTxAggregate returns aggregate values', async () => {
		mockQueryBuilder.setResponses([
			{
				count: '5',
				latestTxsBlockTimestamp: '10',
				oldestTxsBlockTimestamp: '1',
			},
		])

		await expect(
			fetchAddressTxAggregate('0x1111' as Address.Address, 1),
		).resolves.toEqual({
			count: 5,
			latestTxsBlockTimestamp: '10',
			oldestTxsBlockTimestamp: '1',
		})
	})

	it('fetchAddressTxCounts returns sent and received counts', async () => {
		mockQueryBuilder.setResponses([
			{
				cnt: '2',
			},
			{
				cnt: 3,
			},
		])

		await expect(
			fetchAddressTxCounts('0x1111' as Address.Address, 1),
		).resolves.toEqual({ sent: 2, received: 3 })
	})

	it('fetchAddressTransferActivity returns incoming and outgoing', async () => {
		mockQueryBuilder.setResponses([
			[
				{
					tokens: '4',
					address: '0xToken',
					block_timestamp: '100',
				},
			],
			[
				{
					tokens: '1',
					address: '0xToken',
					block_timestamp: '90',
				},
			],
		])

		await expect(
			fetchAddressTransferActivity('0x1111' as Address.Address, 1),
		).resolves.toEqual({
			incoming: [
				{
					tokens: '4',
					address: '0xToken',
					block_timestamp: '100',
				},
			],
			outgoing: [
				{
					tokens: '1',
					address: '0xToken',
					block_timestamp: '90',
				},
			],
		})
	})
})
