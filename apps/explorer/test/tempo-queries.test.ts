import type { Address } from 'ox'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryBuilder = vi.hoisted(() => {
	class MockQueryBuilder {
		private responses: unknown[] = []
		private executeCallCount = 0
		private whereCalls: unknown[][] = []

		setResponses(responses: unknown[]): void {
			this.responses = [...responses]
		}

		reset(): void {
			this.responses = []
			this.executeCallCount = 0
			this.whereCalls = []
		}

		getExecuteCallCount(): number {
			return this.executeCallCount
		}

		getWhereCalls(): unknown[][] {
			return this.whereCalls
		}

		withSignatures(): this {
			return this
		}

		with(): this {
			return this
		}

		selectFrom(): this {
			return this
		}

		selectAll(): this {
			return this
		}

		leftJoin(): this {
			return this
		}

		select(): this {
			return this
		}

		where(...args: unknown[]): this {
			this.whereCalls.push(args)
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

		union(): this {
			return this
		}

		async execute(): Promise<unknown> {
			this.executeCallCount += 1
			return this.nextResponse()
		}

		async executeTakeFirst(): Promise<unknown> {
			this.executeCallCount += 1
			return this.nextResponse()
		}

		async executeTakeFirstOrThrow(): Promise<unknown> {
			this.executeCallCount += 1
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
			const response = this.responses.shift()
			if (response instanceof Error) throw response
			return response
		}
	}

	return new MockQueryBuilder()
})

const mockTidx = vi.hoisted(() => {
	class MockTidx {
		private requests: unknown[] = []
		private responses: unknown[] = []

		setResponses(responses: unknown[]): void {
			this.responses = [...responses]
		}

		reset(): void {
			this.requests = []
			this.responses = []
		}

		getRequests(): unknown[] {
			return this.requests
		}

		async fetch(options: unknown): Promise<{ rows: unknown }> {
			this.requests.push(options)
			if (this.responses.length === 0) {
				throw new Error('No mock tidx responses queued')
			}
			const response = this.responses.shift()
			if (response instanceof Error) throw response
			return { rows: response }
		}
	}

	return new MockTidx()
})

vi.mock('#lib/server/tempo-queries-provider', () => ({
	tidx: mockTidx,
	tempoQueryBuilder: () => mockQueryBuilder,
}))

vi.mock('#wagmi.config', () => ({
	getWagmiConfig: () => ({}),
}))

import {
	fetchAddressOldestTx,
	fetchAddressTxStats,
	fetchContractCreationReceipt,
	fetchTokenTransferBoundaries,
	fetchVirtualAddressTransferStats,
} from '#lib/server/tempo-queries.ts'

describe('tempo-queries', () => {
	beforeEach(() => {
		mockQueryBuilder.reset()
		mockTidx.reset()
	})

	it('fetchVirtualAddressTransferStats aggregates count and boundaries', async () => {
		mockQueryBuilder.setResponses([
			{ count: '7', oldestTimestamp: '10', latestTimestamp: '90' },
		])

		await expect(
			fetchVirtualAddressTransferStats('0x1111' as Address.Address, 1),
		).resolves.toEqual({
			count: 7,
			oldestTimestamp: '10',
			latestTimestamp: '90',
		})
	})

	it('fetchAddressTxStats aggregates count and boundaries', async () => {
		mockQueryBuilder.setResponses([
			{ count: 5, oldestTimestamp: '1', latestTimestamp: '9' },
		])

		await expect(
			fetchAddressTxStats('0x1111' as Address.Address, 1),
		).resolves.toEqual({
			count: 5,
			oldestTimestamp: '1',
			latestTimestamp: '9',
		})
	})

	it('fetchAddressOldestTx picks the older of sent/received rows', async () => {
		mockQueryBuilder.setResponses([
			{ hash: '0xsent', from: '0x1111', block_timestamp: 200 },
			{ hash: '0xreceived', from: '0xother', block_timestamp: 100 },
		])

		await expect(
			fetchAddressOldestTx('0x1111' as Address.Address, 1),
		).resolves.toEqual({
			hash: '0xreceived',
			from: '0xother',
			block_timestamp: 100,
		})
	})

	it('fetchAddressOldestTx falls back to the only present row', async () => {
		mockQueryBuilder.setResponses([
			undefined,
			{ hash: '0xreceived', from: '0xother', block_timestamp: 100 },
		])

		await expect(
			fetchAddressOldestTx('0x1111' as Address.Address, 1),
		).resolves.toEqual({
			hash: '0xreceived',
			from: '0xother',
			block_timestamp: 100,
		})
	})

	it('fetchTokenTransferBoundaries returns min/max timestamps', async () => {
		mockQueryBuilder.setResponses([
			{ oldestTimestamp: '10', latestTimestamp: '20' },
		])

		await expect(
			fetchTokenTransferBoundaries('0x1111' as Address.Address, 1),
		).resolves.toEqual({ oldestTimestamp: '10', latestTimestamp: '20' })
	})

	it('fetchContractCreationReceipt returns the creation receipt row', async () => {
		mockQueryBuilder.setResponses([
			{
				tx_hash: '0xcreated',
				from: '0xCreator',
				block_timestamp: '123',
			},
		])

		await expect(
			fetchContractCreationReceipt('0x1111' as Address.Address, 1),
		).resolves.toEqual({
			tx_hash: '0xcreated',
			from: '0xCreator',
			block_timestamp: '123',
		})
	})

	it('fetchContractCreationReceipt lowercases checksum addresses before indexed comparisons', async () => {
		mockQueryBuilder.setResponses([undefined])

		await fetchContractCreationReceipt(
			'0x73b5d86dEae56497f852FD79dd6fe68C7270FB6B' as Address.Address,
			1,
		)

		expect(mockQueryBuilder.getWhereCalls()).toContainEqual([
			'contract_address',
			'=',
			'0x73b5d86deae56497f852fd79dd6fe68c7270fb6b',
		])
	})

	it('fetchContractCreationReceipt returns undefined when missing', async () => {
		mockQueryBuilder.setResponses([undefined])

		await expect(
			fetchContractCreationReceipt('0x1111' as Address.Address, 1),
		).resolves.toBeUndefined()
	})
})
