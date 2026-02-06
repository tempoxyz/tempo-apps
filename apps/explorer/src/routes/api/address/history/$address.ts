import { createFileRoute } from '@tanstack/react-router'
import type { Config } from 'wagmi'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { Log } from 'viem'
import { parseEventLogs } from 'viem'
import { getBlock, getTransactionReceipt } from 'viem/actions'
import { Abis } from 'viem/tempo'
import { getChainId } from 'wagmi/actions'
import { Actions } from 'wagmi/tempo'
import * as z from 'zod/mini'
import { getRequestURL, hasIndexSupply } from '#lib/env'
import { type KnownEvent, parseKnownEvents } from '#lib/domain/known-events'
import { isTip20Address, type Metadata } from '#lib/domain/tip20'
import {
	fetchAddressDirectTxCountRows,
	fetchAddressDirectTxHistoryRows,
	fetchAddressTransferCountRows,
	fetchAddressTransferEmittedCountRows,
	fetchAddressTransferEmittedHashes,
	fetchAddressTransferHashes,
	fetchBasicTxDataByHashes,
	type SortDirection,
} from '#lib/server/tempo-queries'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const abi = Object.values(Abis).flat()

const [MAX_LIMIT, DEFAULT_LIMIT] = [100, 10]
const HISTORY_COUNT_MAX = 100_000

/**
 * Recursively converts BigInt values to strings for JSON serialization.
 */
function serializeBigInts<T>(value: T): T {
	if (typeof value === 'bigint') {
		return value.toString() as T
	}
	if (Array.isArray(value)) {
		return value.map(serializeBigInts) as T
	}
	if (value !== null && typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value)) {
			result[k] = serializeBigInts(v)
		}
		return result as T
	}
	return value
}

export type EnrichedTransaction = {
	hash: `0x${string}`
	blockNumber: string
	timestamp: number
	from: `0x${string}`
	to: `0x${string}` | null
	value: string
	status: 'success' | 'reverted'
	gasUsed: string
	effectiveGasPrice: string
	knownEvents: KnownEvent[]
}

export type HistoryResponse = {
	transactions: EnrichedTransaction[]
	total: number
	offset: number
	limit: number
	hasMore: boolean
	countCapped: boolean
	error: null | string
}

/**
 * Data sources to query for transaction history:
 * - txs: Direct transactions (from/to the address)
 * - transfers: Transfer events where address is sender/recipient
 * - emitted: Transfer events emitted by the address (for token contracts)
 *
 * Default: 'txs,transfers' - skips emitted to avoid expensive queries for tokens
 * For wallet addresses, pass 'txs,transfers,emitted' to include all sources
 */
type Sources = { txs: boolean; transfers: boolean; emitted: boolean }

function parseSources(val: string | undefined): Sources {
	if (!val) return { txs: true, transfers: true, emitted: false }
	const parts = val.split(',').map((s) => s.trim().toLowerCase())
	return {
		txs: parts.includes('txs'),
		transfers: parts.includes('transfers'),
		emitted: parts.includes('emitted'),
	}
}

const RequestParametersSchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
	sources: z.optional(z.string()),
})

export const Route = createFileRoute('/api/address/history/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!hasIndexSupply())
					return Response.json({
						limit: 0,
						total: 0,
						offset: 0,
						hasMore: false,
						countCapped: false,
						transactions: [],
						error: null,
					} satisfies HistoryResponse)

				try {
					const url = getRequestURL()
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const parseParams = RequestParametersSchema.safeParse(
						Object.fromEntries(url.searchParams),
					)
					if (!parseParams.success)
						return Response.json(
							{ error: z.prettifyError(parseParams.error) },
							{ status: 400 },
						)

					const searchParams = parseParams.data
					const config = getWagmiConfig()
					const client = config.getClient()
					const chainId = getChainId(config)

					const include =
						searchParams.include === 'sent'
							? 'sent'
							: searchParams.include === 'received'
								? 'received'
								: 'all'
					const sortDirection = (
						searchParams.sort === 'asc' ? 'asc' : 'desc'
					) as SortDirection

					const offset = Math.max(
						0,
						Number.isFinite(searchParams.offset)
							? Math.floor(searchParams.offset)
							: 0,
					)

					let limit = Number.isFinite(searchParams.limit)
						? Math.floor(searchParams.limit)
						: DEFAULT_LIMIT

					if (limit > MAX_LIMIT) throw new Error('Limit is too high')
					if (limit < 1) limit = 1

					const includeSent = include === 'all' || include === 'sent'
					const includeReceived = include === 'all' || include === 'received'
					const sources = parseSources(searchParams.sources)

					const fetchSize = limit + 1

					const bufferSize = Math.min(
						Math.max(offset + fetchSize * 5, limit * 3),
						500,
					)

					const queryParams = {
						address,
						chainId,
						includeSent,
						includeReceived,
						sortDirection,
						limit: bufferSize,
					}

					// Build promises based on requested sources
					type DirectRow = {
						hash: Hex.Hex
						block_num: bigint
						from: string
						to: string | null
						value: bigint
					}
					type TransferRow = { tx_hash: Hex.Hex; block_num: bigint }
					type CountRow = { hash: Hex.Hex }

					const emptyDirect: DirectRow[] = []
					const emptyTransfer: TransferRow[] = []
					const emptyCount: CountRow[] = []

					const [
						directResult,
						transferResult,
						transferEmittedResult,
						directCountResult,
						transferCountResult,
						transferEmittedCountResult,
					] = await Promise.all([
						sources.txs
							? fetchAddressDirectTxHistoryRows(queryParams)
							: Promise.resolve(emptyDirect),
						sources.transfers
							? fetchAddressTransferHashes(queryParams)
							: Promise.resolve(emptyTransfer),
						sources.emitted
							? fetchAddressTransferEmittedHashes({
									address,
									chainId,
									sortDirection,
									limit: bufferSize,
								}).catch(() => emptyTransfer)
							: Promise.resolve(emptyTransfer),
						sources.txs
							? fetchAddressDirectTxCountRows({
									address,
									chainId,
									includeSent,
									includeReceived,
									limit: HISTORY_COUNT_MAX,
								})
							: Promise.resolve(emptyCount),
						sources.transfers
							? fetchAddressTransferCountRows({
									address,
									chainId,
									includeSent,
									includeReceived,
									limit: HISTORY_COUNT_MAX,
								})
							: Promise.resolve(emptyCount),
						sources.emitted
							? fetchAddressTransferEmittedCountRows({
									address,
									chainId,
									limit: HISTORY_COUNT_MAX,
								}).catch(() => emptyCount)
							: Promise.resolve(emptyCount),
					])

					type HashEntry = {
						hash: Hex.Hex
						block_num: bigint
						from?: string
						to?: string | null
						value?: bigint
					}
					const allHashes = new Map<Hex.Hex, HashEntry>()

					for (const row of directResult)
						allHashes.set(row.hash, {
							hash: row.hash,
							block_num: row.block_num,
							from: row.from,
							to: row.to,
							value: row.value,
						})
					for (const row of transferResult)
						if (!allHashes.has(row.tx_hash))
							allHashes.set(row.tx_hash, {
								hash: row.tx_hash,
								block_num: row.block_num,
							})
					for (const row of transferEmittedResult)
						if (!allHashes.has(row.tx_hash))
							allHashes.set(row.tx_hash, {
								hash: row.tx_hash,
								block_num: row.block_num,
							})

					const sortedHashes = [...allHashes.values()].sort((a, b) => {
						const blockDiff =
							sortDirection === 'desc'
								? Number(b.block_num) - Number(a.block_num)
								: Number(a.block_num) - Number(b.block_num)
						if (blockDiff !== 0) return blockDiff
						return sortDirection === 'desc'
							? b.hash.localeCompare(a.hash)
							: a.hash.localeCompare(b.hash)
					})

					const paginatedHashes = sortedHashes.slice(offset, offset + fetchSize)
					const hasMore = paginatedHashes.length > limit
					const finalHashes = hasMore
						? paginatedHashes.slice(0, limit)
						: paginatedHashes

					const countHashes = new Set<Hex.Hex>()
					const addCountHashes = (rows: Array<{ hash: Hex.Hex }>) => {
						for (const row of rows) {
							if (countHashes.size >= HISTORY_COUNT_MAX) break
							countHashes.add(row.hash)
						}
					}

					addCountHashes(directCountResult)
					addCountHashes(transferCountResult)
					addCountHashes(transferEmittedCountResult)

					const totalCount = countHashes.size
					const countCapped =
						countHashes.size >= HISTORY_COUNT_MAX ||
						directCountResult.length >= HISTORY_COUNT_MAX ||
						transferCountResult.length >= HISTORY_COUNT_MAX ||
						transferEmittedCountResult.length >= HISTORY_COUNT_MAX

					if (finalHashes.length === 0) {
						return Response.json({
							transactions: [],
							total: totalCount,
							offset,
							limit,
							hasMore: false,
							countCapped,
							error: null,
						} satisfies HistoryResponse)
					}

					const receipts = await Promise.all(
						finalHashes.map((h) =>
							getTransactionReceipt(client, { hash: h.hash }),
						),
					)

					const blockHashes = new Set<`0x${string}`>()
					for (const receipt of receipts) {
						if (receipt.blockHash) blockHashes.add(receipt.blockHash)
					}

					const blockPromises = [...blockHashes].map((blockHash) =>
						getBlock(client, { blockHash }).then(
							(block) => [blockHash, block] as const,
						),
					)
					const blockEntries = await Promise.all(blockPromises)
					const blockMap = new Map(blockEntries)

					const allLogs: Log[] = receipts.flatMap((r) => r.logs as Log[])
					const events = parseEventLogs({ abi, logs: allLogs })
					const tokenAddresses = new Set<Address.Address>()
					for (const event of events) {
						if (isTip20Address(event.address)) {
							tokenAddresses.add(event.address)
						}
					}

					const tokenMetadataEntries = await Promise.all(
						[...tokenAddresses].map(async (token) => {
							try {
								const metadata = await Actions.token.getMetadata(
									config as Config,
									{ token },
								)
								return [token.toLowerCase(), metadata] as const
							} catch {
								return [token.toLowerCase(), undefined] as const
							}
						}),
					)
					const tokenMetadataMap = new Map<string, Metadata | undefined>(
						tokenMetadataEntries,
					)

					const getTokenMetadata = (addr: Address.Address) =>
						tokenMetadataMap.get(addr.toLowerCase())

					const missingTxData = finalHashes.filter((h) => !h.from)
					let txDataMap = new Map<
						string,
						{ from: string; to: string | null; value: bigint }
					>()
					if (missingTxData.length > 0) {
						const txDataResult = await fetchBasicTxDataByHashes(
							chainId,
							missingTxData.map((h) => h.hash),
						)
						txDataMap = new Map(
							txDataResult.map((tx) => [tx.hash, tx] as const),
						)
					}

					const transactions: EnrichedTransaction[] = []

					for (let i = 0; i < finalHashes.length; i++) {
						const hashEntry = finalHashes[i]
						const receipt = receipts[i]
						const block = blockMap.get(receipt.blockHash)

						let from: `0x${string}`
						let to: `0x${string}` | null
						let value: string

						if (hashEntry.from) {
							from = Address.checksum(hashEntry.from as Address.Address)
							to = hashEntry.to
								? Address.checksum(hashEntry.to as Address.Address)
								: null
							value = Hex.fromNumber(hashEntry.value ?? 0n)
						} else {
							const txData = txDataMap.get(hashEntry.hash)
							if (txData) {
								from = Address.checksum(txData.from as Address.Address)
								to = txData.to
									? Address.checksum(txData.to as Address.Address)
									: null
								value = Hex.fromNumber(txData.value)
							} else {
								from = receipt.from
								to = receipt.to
								value = '0x0'
							}
						}

						const knownEvents = parseKnownEvents(receipt, {
							getTokenMetadata,
						})

						transactions.push({
							hash: receipt.transactionHash,
							blockNumber: Hex.fromNumber(receipt.blockNumber),
							timestamp: block ? Number(block.timestamp) : 0,
							from,
							to,
							value,
							status: receipt.status,
							gasUsed: Hex.fromNumber(receipt.gasUsed),
							effectiveGasPrice: Hex.fromNumber(receipt.effectiveGasPrice),
							knownEvents: serializeBigInts(knownEvents),
						})
					}

					return Response.json({
						transactions,
						total: totalCount,
						offset,
						limit,
						hasMore,
						countCapped,
						error: null,
					} satisfies HistoryResponse)
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : error
					console.error(errorMessage)
					return Response.json(
						{ data: null, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})
