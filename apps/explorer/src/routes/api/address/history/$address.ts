import { createFileRoute } from '@tanstack/react-router'
import type { Config } from 'wagmi'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { Log, TransactionReceipt } from 'viem'
import { parseEventLogs } from 'viem'
import { Abis } from 'viem/tempo'
import { getChainId } from 'wagmi/actions'
import { Actions } from 'wagmi/tempo'
import * as z from 'zod/mini'
import { getRequestURL, hasIndexSupply } from '#lib/env'
import { type KnownEvent, parseKnownEvents } from '#lib/domain/known-events'
import { isTip20Address, type Metadata } from '#lib/domain/tip20'
import {
	fetchAddressDirectTxHistoryRows,
	fetchAddressHistoryDistinctCount,
	fetchAddressHistoryTxDetailsByHashes,
	fetchAddressLogRowsByTxHashes,
	fetchAddressReceiptRowsByHashes,
	fetchAddressTransferRowsByTxHashes,
	fetchAddressTransferEmittedHashes,
	fetchAddressTransferHashes,
	type SortDirection,
} from '#lib/server/tempo-queries'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const abi = Object.values(Abis).flat()

const [MAX_LIMIT, DEFAULT_LIMIT] = [100, 10]
const HISTORY_COUNT_MAX = 10_000
const TRANSFER_EVENT_TOPIC0 =
	'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex.Hex

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

function toHistoryStatus(
	status: number | null | undefined,
): 'success' | 'reverted' {
	return status === 0 ? 'reverted' : 'success'
}

function toFiniteTimestamp(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'string') {
		const parsed = Number(value)
		if (Number.isFinite(parsed)) return parsed
		const parsedDate = Date.parse(value)
		if (Number.isFinite(parsedDate)) return Math.floor(parsedDate / 1000)
	}
	return 0
}

function toHexQuantity(value: unknown): Hex.Hex {
	if (typeof value === 'bigint' || typeof value === 'number') {
		try {
			return Hex.fromNumber(value)
		} catch {
			return '0x0'
		}
	}
	if (typeof value === 'string') {
		try {
			return Hex.fromNumber(BigInt(value))
		} catch {
			return '0x0'
		}
	}
	return '0x0'
}

function addressToTopic(address: string): Hex.Hex {
	return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}` as Hex.Hex
}

function toUint256Data(value: bigint): Hex.Hex {
	return `0x${value.toString(16).padStart(64, '0')}` as Hex.Hex
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
						Math.max(offset + fetchSize, limit * 3),
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

					const emptyDirect: DirectRow[] = []
					const emptyTransfer: TransferRow[] = []

					const transferQueryParams = {
						address,
						chainId,
						includeSent,
						includeReceived,
						sortDirection,
					}

					const [directResult, transferResult, emittedResult] =
						await Promise.all([
							sources.txs
								? fetchAddressDirectTxHistoryRows(queryParams)
								: Promise.resolve(emptyDirect),
							sources.transfers
								? fetchAddressTransferHashes({
										...transferQueryParams,
										limit: bufferSize,
									}).catch(() => emptyTransfer)
								: Promise.resolve(emptyTransfer),
							sources.emitted
								? fetchAddressTransferEmittedHashes({
										address,
										chainId,
										sortDirection,
										limit: bufferSize,
									}).catch(() => emptyTransfer)
								: Promise.resolve(emptyTransfer),
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
					for (const row of emittedResult)
						if (!allHashes.has(row.tx_hash))
							allHashes.set(row.tx_hash, {
								hash: row.tx_hash,
								block_num: row.block_num,
							})

					// Skip the expensive count query if no source hit its buffer limit —
					// in that case allHashes already contains every tx hash.
					const anySourceHitLimit =
						directResult.length >= bufferSize ||
						transferResult.length >= bufferSize ||
						emittedResult.length >= bufferSize

					const countResult = anySourceHitLimit
						? await fetchAddressHistoryDistinctCount({
								address,
								chainId,
								includeSent,
								includeReceived,
								includeTxs: sources.txs,
								includeTransfers: sources.transfers,
								includeEmitted: sources.emitted,
								countCap: HISTORY_COUNT_MAX,
							})
						: { count: allHashes.size, capped: false }

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

					const totalCount = countResult.count
					const countCapped = countResult.capped

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

					const finalHashValues = finalHashes.map((entry) => entry.hash)
					const [receiptRows, txRows, logRows, transferRows] =
						await Promise.all([
							fetchAddressReceiptRowsByHashes(chainId, finalHashValues),
							fetchAddressHistoryTxDetailsByHashes(chainId, finalHashValues),
							fetchAddressLogRowsByTxHashes(chainId, finalHashValues),
							fetchAddressTransferRowsByTxHashes(chainId, finalHashValues),
						])

					const receiptMap = new Map(
						receiptRows.map((row) => [row.tx_hash, row] as const),
					)
					const txMap = new Map(txRows.map((row) => [row.hash, row] as const))
					const logsByHash = new Map<Hex.Hex, Log[]>()

					for (const row of logRows) {
						const topics = [
							row.topic0,
							row.topic1,
							row.topic2,
							row.topic3,
						].filter((topic): topic is Hex.Hex => Boolean(topic))

						const log = {
							address: row.address,
							data: row.data,
							topics,
							blockNumber: row.block_num,
							logIndex: row.log_idx,
							transactionHash: row.tx_hash,
							transactionIndex: row.tx_idx,
							removed: false,
						} as unknown as Log

						const txLogs = logsByHash.get(row.tx_hash)
						if (txLogs) {
							txLogs.push(log)
						} else {
							logsByHash.set(row.tx_hash, [log])
						}
					}

					// Supplement logs with Transfer events from the transfer table.
					// The logs table may not have all event types indexed, so merge
					// transfer rows to ensure Transfer events are always present.
					const logIndicesByHash = new Map<Hex.Hex, Set<number>>()
					for (const row of logRows) {
						let indices = logIndicesByHash.get(row.tx_hash)
						if (!indices) {
							indices = new Set()
							logIndicesByHash.set(row.tx_hash, indices)
						}
						indices.add(row.log_idx)
					}

					for (const row of transferRows) {
						// Skip if the logs table already has this exact log entry
						if (logIndicesByHash.get(row.tx_hash)?.has(row.log_idx)) continue

						const log = {
							address: row.address,
							data: toUint256Data(row.tokens),
							topics: [
								TRANSFER_EVENT_TOPIC0,
								addressToTopic(row.from),
								addressToTopic(row.to),
							],
							blockNumber: row.block_num,
							logIndex: row.log_idx,
							transactionHash: row.tx_hash,
							transactionIndex: 0,
							removed: false,
						} as unknown as Log

						const txLogs = logsByHash.get(row.tx_hash)
						if (txLogs) {
							txLogs.push(log)
						} else {
							logsByHash.set(row.tx_hash, [log])
						}
					}

					const allLogs: Log[] = []
					for (const txLogs of logsByHash.values()) {
						allLogs.push(...txLogs)
					}

					const events = (() => {
						try {
							return parseEventLogs({ abi, logs: allLogs })
						} catch (error) {
							console.error(
								'[history] failed to parse logs for metadata:',
								error,
							)
							return []
						}
					})()
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

					const transactions: EnrichedTransaction[] = []

					for (const hashEntry of finalHashes) {
						const receipt = receiptMap.get(hashEntry.hash)
						const tx = txMap.get(hashEntry.hash)
						const txLogs = logsByHash.get(hashEntry.hash) ?? []

						const fromSource =
							tx?.from ?? hashEntry.from ?? receipt?.from ?? address
						const toSource = tx?.to ?? hashEntry.to ?? receipt?.to ?? null
						const valueSource = tx?.value ?? hashEntry.value ?? 0n
						const blockNumberSource =
							receipt?.block_num ?? tx?.block_num ?? hashEntry.block_num
						const timestampSource =
							receipt?.block_timestamp ?? tx?.block_timestamp ?? 0
						const status = toHistoryStatus(receipt?.status)

						const receiptForKnownEvents = {
							from: (receipt?.from ?? fromSource) as Address.Address,
							to: toSource as Address.Address | null,
							status,
							logs: txLogs,
						} as unknown as TransactionReceipt

						const transactionForKnownEvents = tx
							? {
									to: tx.to as Address.Address | null,
									input: tx.input,
									data: tx.input,
									calls: Array.isArray(tx.calls)
										? (tx.calls as never)
										: undefined,
								}
							: undefined

						const knownEvents = (() => {
							try {
								return parseKnownEvents(receiptForKnownEvents, {
									transaction: transactionForKnownEvents as never,
									getTokenMetadata,
								})
							} catch (error) {
								console.error(
									`[history] failed to parse known events for ${hashEntry.hash}:`,
									error,
								)
								return []
							}
						})()

						transactions.push({
							hash: hashEntry.hash,
							blockNumber: toHexQuantity(blockNumberSource),
							timestamp: toFiniteTimestamp(timestampSource),
							from: Address.checksum(fromSource as Address.Address),
							to: toSource
								? Address.checksum(toSource as Address.Address)
								: null,
							value: toHexQuantity(valueSource),
							status,
							gasUsed: toHexQuantity(receipt?.gas_used),
							effectiveGasPrice: toHexQuantity(receipt?.effective_gas_price),
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
