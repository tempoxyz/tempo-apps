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
import { parseKnownEvents } from '#lib/domain/known-events'
import { isTip20Address, type Metadata } from '#lib/domain/tip20'
import {
	canUseTempoActivityApi,
	parseSources,
} from '#lib/server/address-history-source-selection'
import {
	fetchAddressDirectTxHistoryRows,
	fetchAddressHistoryTxDetailsByHashes,
	fetchAddressLogRowsByTxHashes,
	fetchAddressReceiptRowsByHashes,
	fetchAddressTxOnlyHistoryPageWithJoins,
	fetchAddressTransferRowsByTxHashes,
	fetchAddressTransferEmittedHashes,
	fetchAddressTransferHashes,
	type SortDirection,
} from '#lib/server/tempo-queries'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

import {
	buildTxOnlyTransactions,
	type EnrichedTransaction,
	type HistoryHashEntry,
} from '#lib/server/build-tx-only-transactions'

export {
	buildTxOnlyTransactions,
	type EnrichedTransaction,
	type HistoryHashEntry,
} from '#lib/server/build-tx-only-transactions'

const abi = Object.values(Abis).flat()

const [MAX_LIMIT, DEFAULT_LIMIT] = [100, 10]
const HISTORY_COUNT_MAX = 10_000
const TRANSFER_EVENT_TOPIC0 =
	'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

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
	const normalizeEpoch = (epoch: number) =>
		epoch > 1_000_000_000_000 ? Math.floor(epoch / 1000) : epoch

	if (typeof value === 'number' && Number.isFinite(value)) {
		return normalizeEpoch(value)
	}
	if (typeof value === 'string') {
		const parsed = Number(value)
		if (Number.isFinite(parsed)) return normalizeEpoch(parsed)
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

export type HistoryResponse = {
	transactions: import('#lib/server/build-tx-only-transactions').EnrichedTransaction[]
	total: number
	offset: number
	limit: number
	hasMore: boolean
	countCapped: boolean
	error: null | string
}

type TempoActivityItem = {
	hash: Hex.Hex
	blockNumber: string | number
	timestamp: string | number
	from: Address.Address
	to: Address.Address | null
	value: string | number
	status: 'success' | 'reverted'
	gasUsed: string | number
	effectiveGasPrice: string | number
	events: EnrichedTransaction['knownEvents']
}

type TempoActivityResponse = {
	items: TempoActivityItem[]
	offset: number
	limit: number
	hasMore: boolean
	includesApplied: {
		transfers: boolean
		zones: {
			requested: boolean
			private: boolean
		}
	}
}

const TEMPO_ACTIVITY_API_BASE_URL = 'https://api.tempo.xyz'
const TEMPO_ACTIVITY_FETCH_LIMIT = 200

async function fetchTempoAddressActivity(params: {
	address: Address.Address
	chainId: number
	include: 'all' | 'sent' | 'received'
	limit: number
	offset: number
}): Promise<TempoActivityResponse> {
	const apiKey = process.env.TEMPO_API_KEY
	if (!apiKey) throw new Error('Missing TEMPO_API_KEY')

	const searchParams = new URLSearchParams({
		include: params.include,
		includes: 'zones,transfers',
		limit: params.limit.toString(),
		offset: params.offset.toString(),
	})
	const url = new URL(
		`/chains/${params.chainId}/addresses/${params.address}/activity`,
		TEMPO_ACTIVITY_API_BASE_URL,
	)
	url.search = searchParams.toString()

	const response = await fetch(url, {
		headers: {
			Accept: 'application/json',
			'X-API-Key': apiKey,
		},
	})

	if (!response.ok) {
		throw new Error(`Tempo activity API failed with ${response.status}`)
	}

	return (await response.json()) as TempoActivityResponse
}

function mapTempoActivityItem(
	item: TempoActivityItem,
): import('#lib/server/build-tx-only-transactions').EnrichedTransaction {
	return {
		hash: item.hash,
		blockNumber: toHexQuantity(item.blockNumber),
		timestamp: toFiniteTimestamp(item.timestamp),
		from: Address.checksum(item.from),
		to: item.to ? Address.checksum(item.to) : null,
		value: toHexQuantity(item.value),
		status: item.status,
		gasUsed: toHexQuantity(item.gasUsed),
		effectiveGasPrice: toHexQuantity(item.effectiveGasPrice),
		knownEvents: item.events,
	}
}

async function fetchTempoFilteredAddressActivity(params: {
	address: Address.Address
	chainId: number
	include: 'all' | 'sent' | 'received'
	offset: number
	limit: number
	status?: 'success' | 'reverted' | undefined
	after?: number | undefined
}): Promise<HistoryResponse> {
	const targetCount = params.offset + params.limit + 1
	const filteredItems: TempoActivityItem[] = []
	let sourceOffset = 0
	let sourceHasMore = true
	while (
		sourceHasMore &&
		filteredItems.length < targetCount &&
		sourceOffset < HISTORY_COUNT_MAX
	) {
		const page = await fetchTempoAddressActivity({
			address: params.address,
			chainId: params.chainId,
			include: params.include,
			limit: TEMPO_ACTIVITY_FETCH_LIMIT,
			offset: sourceOffset,
		})

		sourceHasMore = page.hasMore
		sourceOffset += page.items.length

		for (const item of page.items) {
			const timestamp = toFiniteTimestamp(item.timestamp)
			if (params.status && item.status !== params.status) continue
			if (params.after && timestamp < params.after) continue
			filteredItems.push(item)
		}

		if (page.items.length === 0) break
	}

	const pageItems = filteredItems.slice(
		params.offset,
		params.offset + params.limit,
	)
	const countCapped = sourceHasMore
	const hasMore =
		filteredItems.length > params.offset + params.limit || sourceHasMore
	const total = countCapped
		? Math.max(filteredItems.length, params.offset)
		: filteredItems.length

	return {
		transactions: pageItems.map(mapTempoActivityItem),
		total,
		offset: params.offset,
		limit: params.limit,
		hasMore,
		countCapped,
		error: null,
	}
}

const RequestParametersSchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
	sources: z.optional(z.string()),
	status: z.optional(z.enum(['success', 'reverted'])),
	after: z.optional(z.coerce.number()),
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

					const after = searchParams.after
					const includeSent = include === 'all' || include === 'sent'
					const includeReceived = include === 'all' || include === 'received'
					const sources = parseSources(searchParams.sources)
					const statusFilter = searchParams.status
					const tip20Address = isTip20Address(address)

					const shouldUseTempoActivityApi = canUseTempoActivityApi({
						hasTempoApiKey: Boolean(process.env.TEMPO_API_KEY),
						isTip20: tip20Address,
						sources,
						sortDirection,
					})

					if (shouldUseTempoActivityApi) {
						try {
							if (statusFilter || after) {
								return Response.json(
									await fetchTempoFilteredAddressActivity({
										address,
										chainId,
										include,
										offset,
										limit,
										status: statusFilter,
										after,
									}),
								)
							}

							const activity = await fetchTempoAddressActivity({
								address,
								chainId,
								include,
								limit,
								offset,
							})
							const transactions = activity.items.map(mapTempoActivityItem)

							return Response.json({
								transactions,
								total: activity.hasMore
									? offset + transactions.length + 1
									: offset + transactions.length,
								offset,
								limit,
								hasMore: activity.hasMore,
								countCapped: activity.hasMore,
								error: null,
							} satisfies HistoryResponse)
						} catch (error) {
							console.error(
								'[history] Tempo activity API failed, falling back to indexed history:',
								error,
							)
						}
					}

					const fetchSize = limit + 1
					const isTxOnlySource =
						sources.txs && !sources.transfers && !sources.emitted

					// When filtering by status in multi-source mode, increase buffer
					// so we have enough hashes to fill a page after filtering.
					const bufferSize = Math.min(
						Math.max(offset + fetchSize, limit * 3),
						HISTORY_COUNT_MAX + 1,
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

					let hasMore = false
					let finalHashes: HistoryHashEntry[] = []
					let totalCount = 0
					let countCapped = false
					let txOnlyPageResult: Awaited<
						ReturnType<typeof fetchAddressTxOnlyHistoryPageWithJoins>
					> | null = null

					if (isTxOnlySource) {
						txOnlyPageResult = await fetchAddressTxOnlyHistoryPageWithJoins({
							address,
							chainId,
							includeSent,
							includeReceived,
							sortDirection,
							offset,
							limit,
							countCap: HISTORY_COUNT_MAX,
							statusFilter,
							after,
						})

						hasMore = txOnlyPageResult.hasMore
						totalCount = txOnlyPageResult.total
						countCapped = txOnlyPageResult.countCapped
						finalHashes = txOnlyPageResult.hashes.map((row) => ({
							hash: row.hash,
							block_num: row.block_num,
							from: row.from,
							to: row.to,
							value: row.value,
						}))
					} else {
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

						const allHashes = new Map<Hex.Hex, HistoryHashEntry>()

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

						// Use the deduped hash map size as the count. When any source
						// hit the buffer limit, the map may be incomplete so mark
						// the count as capped to enable indefinite pagination.
						const anySourceHitLimit =
							directResult.length >= bufferSize ||
							transferResult.length >= bufferSize ||
							emittedResult.length >= bufferSize

						const countResult = {
							count: allHashes.size,
							capped: anySourceHitLimit,
						}

						let sortedHashes = [...allHashes.values()].sort((a, b) => {
							const blockDiff =
								sortDirection === 'desc'
									? Number(b.block_num) - Number(a.block_num)
									: Number(a.block_num) - Number(b.block_num)
							if (blockDiff !== 0) return blockDiff
							return sortDirection === 'desc'
								? b.hash.localeCompare(a.hash)
								: a.hash.localeCompare(b.hash)
						})

						// Filter by receipt status before pagination to ensure correct page fill
						if (statusFilter) {
							const hashValues = sortedHashes.map((h) => h.hash)
							const receipts = await fetchAddressReceiptRowsByHashes(
								chainId,
								hashValues,
							)
							const statusMap = new Map(
								receipts.map((r) => [r.tx_hash, r.status]),
							)
							const targetStatus = statusFilter === 'reverted' ? 0 : 1
							sortedHashes = sortedHashes.filter(
								(h) => statusMap.get(h.hash) === targetStatus,
							)
						}

						const paginatedHashes = sortedHashes.slice(
							offset,
							offset + fetchSize,
						)
						hasMore = paginatedHashes.length > limit
						finalHashes = hasMore
							? paginatedHashes.slice(0, limit)
							: paginatedHashes

						if (statusFilter) {
							// Use the filtered hash count from the buffer.
							// The buffer now uses HISTORY_COUNT_MAX+1, so for most
							// addresses this gives the exact filtered count.
							totalCount = sortedHashes.length
							countCapped = false
						} else {
							totalCount = countResult.count
							countCapped = countResult.capped
						}
					}

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

					if (isTxOnlySource) {
						if (!txOnlyPageResult)
							throw new Error('Missing tx-only history page result')

						const transactions = await buildTxOnlyTransactions({
							address,
							hashes: finalHashes,
							txRows: txOnlyPageResult.txRows,
							receiptRows: txOnlyPageResult.receiptRows,
							logRows: txOnlyPageResult.logRows,
						})

						return Response.json({
							transactions,
							total: totalCount,
							offset,
							limit,
							hasMore,
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
							contractAddress: receipt?.contract_address
								? (receipt.contract_address as Address.Address)
								: null,
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

					const finalTransactions = after
						? transactions.filter((tx) => tx.timestamp >= after)
						: transactions

					return Response.json({
						transactions: finalTransactions,
						total: after ? finalTransactions.length : totalCount,
						offset,
						limit,
						hasMore: after ? false : hasMore,
						countCapped: after ? false : countCapped,
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
