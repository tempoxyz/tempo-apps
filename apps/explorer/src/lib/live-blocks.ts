import type { Block } from 'viem'

export interface LiveBlocksState {
	blocks: Block[]
	lastAddedBlock: bigint | undefined
}

export function calculateBlocksToFetch(
	lastAddedBlock: bigint | undefined,
	targetBlockNumber: bigint,
): bigint[] {
	const startBlock =
		lastAddedBlock !== undefined ? lastAddedBlock + 1n : targetBlockNumber
	const blocksToFetch: bigint[] = []

	for (let bn = startBlock; bn <= targetBlockNumber; bn++) {
		blocksToFetch.push(bn)
	}

	return blocksToFetch
}

export function mergeBlocks(
	existingBlocks: Block[],
	newBlocks: Block[],
	maxBlocks: number,
): Block[] {
	const existingNumbers = new Set(existingBlocks.map((b) => b.number))
	const uniqueNewBlocks = newBlocks.filter(
		(b) => b.number !== undefined && !existingNumbers.has(b.number),
	)

	return [...uniqueNewBlocks, ...existingBlocks]
		.sort((a, b) => Number((b.number ?? 0n) - (a.number ?? 0n)))
		.slice(0, maxBlocks)
}

export function getHighestBlockNumber(blocks: Block[]): bigint | undefined {
	if (blocks.length === 0) return undefined
	return blocks.reduce((max, block) => {
		const num = block.number ?? 0n
		return num > max ? num : max
	}, 0n)
}
