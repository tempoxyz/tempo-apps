import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Hex } from 'ox'
import type { Block, Log, TransactionReceipt } from 'viem'
import { getBlock } from 'wagmi/actions'
import type { Actions } from 'wagmi/tempo'
import type { KnownEvent } from '#lib/domain/known-events'
import { parseKnownEvents } from '#lib/domain/known-events'
import { isTip20Address } from '#lib/domain/tip20.ts'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config.ts'

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
			const config = getWagmiConfig()
			const latestBlock = await getBlock(config)
			const latestBlockNumber = latestBlock.number

			const startBlock =
				latestBlockNumber - BigInt((page - 1) * BLOCKS_PER_PAGE)

			const blockNumbers: bigint[] = []
			for (let i = 0n; i < BigInt(BLOCKS_PER_PAGE); i++) {
				const blockNum = startBlock - i
				if (blockNum >= 0n) blockNumbers.push(blockNum)
			}

			// TODO: investigate & consider batch/multicall
			const blocks = await Promise.all(
				blockNumbers.map((blockNumber) =>
					getBlock(config, { blockNumber }).catch(() => null),
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

export function blockDetailQueryOptions(blockRef: BlockIdentifier) {
	return queryOptions({
		queryKey: ['block-detail', blockRef],
		queryFn: async () => {
			const config = getWagmiConfig()
			const block = await getBlock(config, {
				includeTransactions: true,
				...(blockRef.kind === 'hash'
					? { blockHash: blockRef.blockHash }
					: { blockNumber: blockRef.blockNumber }),
			})

			return {
				blockRef,
				block: block as BlockWithTransactions,
			}
		},
		placeholderData: keepPreviousData,
	})
}

// Batch query for page transaction known events
export function blockKnownEventsQueryOptions(
	blockNumber: bigint,
	transactions: BlockTransaction[],
	page: number = 1,
) {
	return queryOptions({
		queryKey: ['block-known-events', blockNumber.toString(), page],
		queryFn: async () => {
			const client = getBatchedClient()

			const txsWithHash = transactions.filter(({ hash }) => hash)
			const receipts = await Promise.all(
				txsWithHash.map(({ hash }) =>
					client.getTransactionReceipt({ hash }).catch(() => null),
				),
			)

			const receiptByHash = new Map<string, TransactionReceipt>()
			for (const receipt of receipts) {
				if (receipt) {
					receiptByHash.set(receipt.transactionHash.toLowerCase(), receipt)
				}
			}

			const allTip20Addresses = new Set<string>()
			for (const receipt of receipts) {
				if (!receipt) continue
				for (const log of receipt.logs as Log[]) {
					if (isTip20Address(log.address)) {
						allTip20Addresses.add(log.address.toLowerCase())
					}
				}
			}

			const tip20Array = Array.from(allTip20Addresses) as Hex.Hex[]
			const metadataResults = await Promise.all(
				tip20Array.map((token) => client.token.getMetadata({ token })),
			)

			const tokenMetadataMap = new Map<
				string,
				Actions.token.getMetadata.ReturnValue
			>()
			for (const [index, address] of tip20Array.entries()) {
				const metadata = metadataResults[index]
				if (metadata) tokenMetadataMap.set(address.toLowerCase(), metadata)
			}

			const result: Record<Hex.Hex, KnownEvent[]> = {}
			for (const transaction of transactions) {
				if (!transaction.hash) continue
				const receipt = receiptByHash.get(transaction.hash.toLowerCase())
				if (!receipt) continue

				const getTokenMetadata = (address: Hex.Hex) =>
					tokenMetadataMap.get(address.toLowerCase())

				const events = parseKnownEvents(receipt, {
					transaction,
					getTokenMetadata,
				})
				result[transaction.hash] = events
			}

			return result
		},
		staleTime: Number.POSITIVE_INFINITY, // Receipts don't change
	})
}
