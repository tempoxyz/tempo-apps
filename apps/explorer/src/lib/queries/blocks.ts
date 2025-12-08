import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Hex } from 'ox'
import type { Block } from 'viem'
import { getBlock, getTransactionReceipt } from 'wagmi/actions'
import { type KnownEvent, parseKnownEvents } from '#lib/domain/known-events'
import * as Tip20 from '#lib/domain/tip20.ts'
import { getConfig } from '#wagmi.config.ts'

export const BLOCKS_PER_PAGE = 12

export type BlockIdentifier =
	| { kind: 'hash'; blockHash: Hex.Hex }
	| { kind: 'number'; blockNumber: bigint }

export type BlockWithTransactions = Block<bigint, true>
export type BlockTransaction = BlockWithTransactions['transactions'][number]

export function blocksQueryOptions(page: number) {
	return queryOptions({
		queryKey: ['blocks-loader', page],
		queryFn: async () => {
			const wagmiConfig = getConfig()

			const latestBlock = await getBlock(wagmiConfig)
			const latestBlockNumber = latestBlock.number

			const startBlock =
				latestBlockNumber - BigInt((page - 1) * BLOCKS_PER_PAGE)

			const blockNumbers: bigint[] = []
			for (let i = 0n; i < BigInt(BLOCKS_PER_PAGE); i++) {
				const blockNum = startBlock - i
				if (blockNum >= 0n) blockNumbers.push(blockNum)
			}

			const blocks = await Promise.all(
				blockNumbers.map((blockNumber) =>
					getBlock(wagmiConfig, { blockNumber }).catch(() => null),
				),
			)

			return {
				latestBlockNumber,
				blocks: blocks.filter(Boolean) as Block[],
			}
		},
		placeholderData: keepPreviousData,
	})
}

export const TRANSACTIONS_PER_PAGE = 20

export function blockDetailQueryOptions(
	blockRef: BlockIdentifier,
	page: number = 1,
) {
	return queryOptions({
		queryKey: ['block-detail', blockRef, page],
		queryFn: async () => {
			const wagmiConfig = getConfig()
			const block = await getBlock(wagmiConfig, {
				includeTransactions: true,
				...(blockRef.kind === 'hash'
					? { blockHash: blockRef.blockHash }
					: { blockNumber: blockRef.blockNumber }),
			})

			const allTransactions = block.transactions as BlockTransaction[]
			const startIndex = (page - 1) * TRANSACTIONS_PER_PAGE
			const pageTransactions = allTransactions.slice(
				startIndex,
				startIndex + TRANSACTIONS_PER_PAGE,
			)

			const knownEventsByHash = await fetchKnownEventsForTransactions(
				pageTransactions,
				wagmiConfig,
			)

			return {
				blockRef,
				block: block as BlockWithTransactions,
				knownEventsByHash,
				page,
			}
		},
		placeholderData: keepPreviousData,
	})
}

async function fetchKnownEventsForTransactions(
	transactions: BlockTransaction[],
	wagmiConfig: ReturnType<typeof getConfig>,
): Promise<Record<Hex.Hex, KnownEvent[]>> {
	const entries = await Promise.all(
		transactions.map(async (transaction) => {
			if (!transaction?.hash)
				return [transaction.hash ?? 'unknown', []] as const

			try {
				const receipt = await getTransactionReceipt(wagmiConfig, {
					hash: transaction.hash,
				})
				const getTokenMetadata = await Tip20.metadataFromLogs(receipt.logs)
				const events = parseKnownEvents(receipt, {
					transaction,
					getTokenMetadata,
				})

				return [transaction.hash, events] as const
			} catch (error) {
				console.error('Failed to load transaction description', {
					hash: transaction.hash,
					error,
				})
				return [transaction.hash, []] as const
			}
		}),
	)

	return Object.fromEntries(
		entries.filter(([hash]) => Boolean(hash)),
	) as Record<Hex.Hex, KnownEvent[]>
}
