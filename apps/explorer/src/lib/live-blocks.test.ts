import { describe, it, expect } from 'vitest'
import type { Block } from 'viem'
import {
	calculateBlocksToFetch,
	mergeBlocks,
	getHighestBlockNumber,
} from './live-blocks'

function createMockBlock(number: bigint): Block {
	return {
		number,
		hash: `0x${number.toString(16).padStart(64, '0')}`,
		timestamp: BigInt(Date.now()),
		transactions: [],
	} as unknown as Block
}

describe('calculateBlocksToFetch', () => {
	it('fetches only target block when lastAddedBlock is undefined', () => {
		const result = calculateBlocksToFetch(undefined, 100n)
		expect(result).toEqual([100n])
	})

	it('fetches range when there is a gap', () => {
		const result = calculateBlocksToFetch(95n, 100n)
		expect(result).toEqual([96n, 97n, 98n, 99n, 100n])
	})

	it('fetches single block when lastAddedBlock is one less than target', () => {
		const result = calculateBlocksToFetch(99n, 100n)
		expect(result).toEqual([100n])
	})

	it('returns empty array when target is less than or equal to lastAddedBlock', () => {
		const result = calculateBlocksToFetch(100n, 100n)
		expect(result).toEqual([])
	})

	it('handles large gaps correctly', () => {
		const result = calculateBlocksToFetch(0n, 10n)
		expect(result).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n])
	})
})

describe('mergeBlocks', () => {
	it('adds new blocks to empty list', () => {
		const newBlocks = [createMockBlock(100n), createMockBlock(99n)]
		const result = mergeBlocks([], newBlocks, 10)
		expect(result.map((b) => b.number)).toEqual([100n, 99n])
	})

	it('merges without duplicates', () => {
		const existing = [createMockBlock(100n), createMockBlock(99n)]
		const newBlocks = [createMockBlock(101n), createMockBlock(100n)]
		const result = mergeBlocks(existing, newBlocks, 10)
		expect(result.map((b) => b.number)).toEqual([101n, 100n, 99n])
	})

	it('sorts by block number descending', () => {
		const existing = [createMockBlock(95n)]
		const newBlocks = [createMockBlock(100n), createMockBlock(97n)]
		const result = mergeBlocks(existing, newBlocks, 10)
		expect(result.map((b) => b.number)).toEqual([100n, 97n, 95n])
	})

	it('limits to maxBlocks', () => {
		const existing = [
			createMockBlock(90n),
			createMockBlock(89n),
			createMockBlock(88n),
		]
		const newBlocks = [createMockBlock(100n), createMockBlock(99n)]
		const result = mergeBlocks(existing, newBlocks, 3)
		expect(result.map((b) => b.number)).toEqual([100n, 99n, 90n])
	})

	it('handles gap scenario - blocks N+1 to N+5 when only N was shown', () => {
		const existing = [createMockBlock(100n)]
		const newBlocks = [
			createMockBlock(105n),
			createMockBlock(104n),
			createMockBlock(103n),
			createMockBlock(102n),
			createMockBlock(101n),
		]
		const result = mergeBlocks(existing, newBlocks, 10)
		expect(result.map((b) => b.number)).toEqual([
			105n,
			104n,
			103n,
			102n,
			101n,
			100n,
		])
	})
})

describe('getHighestBlockNumber', () => {
	it('returns undefined for empty array', () => {
		expect(getHighestBlockNumber([])).toBeUndefined()
	})

	it('returns the highest block number', () => {
		const blocks = [
			createMockBlock(95n),
			createMockBlock(100n),
			createMockBlock(97n),
		]
		expect(getHighestBlockNumber(blocks)).toBe(100n)
	})
})

describe('block skipping scenarios', () => {
	it('does not skip blocks when notifications arrive out of order', () => {
		const lastAddedBlock: bigint | undefined = 100n
		const allBlocks: Block[] = [createMockBlock(100n)]

		// Simulate: we get notification for block 105, but missed 101-104
		const blocksToFetch = calculateBlocksToFetch(lastAddedBlock, 105n)
		expect(blocksToFetch).toEqual([101n, 102n, 103n, 104n, 105n])

		// Simulate fetching all these blocks
		const fetchedBlocks = blocksToFetch.map(createMockBlock)
		const merged = mergeBlocks(allBlocks, fetchedBlocks, 20)

		// Verify no blocks are skipped
		expect(merged.map((b) => b.number)).toEqual([
			105n,
			104n,
			103n,
			102n,
			101n,
			100n,
		])
	})

	it('handles rapid block arrivals without skipping', () => {
		let lastAddedBlock: bigint | undefined = 100n
		let allBlocks: Block[] = [createMockBlock(100n)]

		// First notification: block 102 (missed 101)
		let blocksToFetch = calculateBlocksToFetch(lastAddedBlock, 102n)
		expect(blocksToFetch).toEqual([101n, 102n])

		let fetchedBlocks = blocksToFetch.map(createMockBlock)
		allBlocks = mergeBlocks(allBlocks, fetchedBlocks, 20)
		lastAddedBlock = getHighestBlockNumber(fetchedBlocks)

		// Second notification: block 105 (missed 103, 104)
		blocksToFetch = calculateBlocksToFetch(lastAddedBlock, 105n)
		expect(blocksToFetch).toEqual([103n, 104n, 105n])

		fetchedBlocks = blocksToFetch.map(createMockBlock)
		allBlocks = mergeBlocks(allBlocks, fetchedBlocks, 20)

		// Verify complete sequence
		expect(allBlocks.map((b) => b.number)).toEqual([
			105n,
			104n,
			103n,
			102n,
			101n,
			100n,
		])
	})

	it('handles the N...N+100 skip scenario from the bug report', () => {
		const lastAddedBlock: bigint | undefined = 1000n
		let allBlocks: Block[] = [createMockBlock(1000n)]

		// Simulate: only got notification for block 1010, missed 1001-1009
		const blocksToFetch = calculateBlocksToFetch(lastAddedBlock, 1010n)
		expect(blocksToFetch.length).toBe(10)
		expect(blocksToFetch[0]).toBe(1001n)
		expect(blocksToFetch[blocksToFetch.length - 1]).toBe(1010n)

		const fetchedBlocks = blocksToFetch.map(createMockBlock)
		allBlocks = mergeBlocks(allBlocks, fetchedBlocks, 20)

		// Verify no gaps in the sequence
		const blockNumbers = allBlocks.map((b) => b.number)
		for (let i = 0; i < blockNumbers.length - 1; i++) {
			const current = blockNumbers[i]
			const next = blockNumbers[i + 1]
			if (current !== undefined && next !== undefined) {
				expect(current - next).toBe(1n)
			}
		}
	})
})
