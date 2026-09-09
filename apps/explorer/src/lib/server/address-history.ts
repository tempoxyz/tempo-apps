import { type InferResponseType, parseResponse } from 'hono/client'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import {
	getAbiItem,
	toFunctionSelector,
	type Log,
	type TransactionReceipt,
} from 'viem'
import type { Config } from 'wagmi'
import { Actions } from 'wagmi/tempo'
import * as z from 'zod/mini'

import {
	decodeKnownTransactionCall,
	type KnownEvent,
	parseKnownEvents,
} from '#lib/domain/known-events'
import { isTip20Address, type Metadata } from '#lib/domain/tip20'
import {
	activitiesToKnownEvents,
	selectTransactionDescriptionEvents,
	type TransactionActivity,
} from '#lib/domain/transaction-activities'
import { api } from '#lib/server/tempo-api'
import { getTransactionActivities } from '#lib/server/transaction-activities'
import { parseTimestamp } from '#lib/timestamp'
import { getWagmiConfig } from '#wagmi.config'
import { zonePortalAbi } from '#lib/abis'
import { isZonePortalAddress } from '#lib/domain/zones'

export const [MAX_LIMIT, DEFAULT_LIMIT] = [10, 10]
const HISTORY_TOTAL_CACHE_TTL = 60_000
const HISTORY_TOTAL_CACHE_MAX_ENTRIES = 50
const SUBMIT_BATCH_SELECTOR = toFunctionSelector(
	getAbiItem({ abi: zonePortalAbi, name: 'submitBatch' }),
)

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
	total: number | null
	limit: number
	nextCursor: string | null
	reverseCursor: string | null
	countCapped: boolean
	error: null | string
}

export const RequestParametersSchema = z.object({
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	cursor: z.optional(z.string()),
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
	status: z.optional(z.enum(['success', 'reverted'])),
	after: z.optional(z.coerce.number()),
	hideSubmitBatches: z.optional(z.enum(['true', 'false'])),
})

export type HistoryRequestParameters = z.infer<typeof RequestParametersSchema>

type TransactionRow = InferResponseType<
	typeof api.v1.transactions.$get,
	200
>['data'][number]

type HistoryTotal = {
	totalCount: number
	totalCountCapped: boolean
}

const historyTotalCache = new Map<
	string,
	{ promise: Promise<HistoryTotal | undefined>; timestamp: number }
>()

function historyFilters(
	address: Address.Address,
	searchParams: HistoryRequestParameters,
) {
	const sideFilter =
		searchParams.include === 'sent'
			? { sender: address }
			: searchParams.include === 'received'
				? { recipient: address }
				: { address }

	return {
		...sideFilter,
		...(searchParams.status ? { status: searchParams.status } : {}),
		...(searchParams.after
			? {
					'timestamp.from': new Date(searchParams.after * 1000).toISOString(),
				}
			: {}),
	}
}

function getCachedHistoryTotal(
	key: string,
): Promise<HistoryTotal | undefined> | undefined {
	const cached = historyTotalCache.get(key)
	if (cached && Date.now() - cached.timestamp < HISTORY_TOTAL_CACHE_TTL)
		return cached.promise
	if (cached) historyTotalCache.delete(key)
}

function cacheHistoryTotal(
	key: string,
	promise: Promise<HistoryTotal | undefined>,
) {
	if (
		!historyTotalCache.has(key) &&
		historyTotalCache.size >= HISTORY_TOTAL_CACHE_MAX_ENTRIES
	) {
		const oldestKey = historyTotalCache.keys().next().value
		if (oldestKey) historyTotalCache.delete(oldestKey)
	}

	historyTotalCache.set(key, { promise, timestamp: Date.now() })
	void promise.then((total) => {
		if (total === undefined && historyTotalCache.get(key)?.promise === promise)
			historyTotalCache.delete(key)
	})
}

function serializeBigInts<T>(value: T): T {
	if (typeof value === 'bigint') {
		return value.toString() as T
	}
	if (Array.isArray(value)) {
		return value.map(serializeBigInts) as T
	}
	if (value !== null && typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [key, nestedValue] of Object.entries(value)) {
			result[key] = serializeBigInts(nestedValue)
		}
		return result as T
	}
	return value
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

function transactionCursor(row: TransactionRow): string {
	// Tempo transaction cursors encode the block and transaction index boundary.
	return btoa(
		JSON.stringify([Number(row.blockNumber), Number(row.transactionIndex)]),
	)
}

async function fetchFilteredHistoryPage(
	address: Address.Address,
	chainId: number,
	searchParams: HistoryRequestParameters,
	limit: number,
): Promise<{
	data: TransactionRow[]
	meta?: HistoryTotal | undefined
	nextCursor: string | null
	reverseCursor: string | null
}> {
	Address.assert(address)
	const account = address.toLowerCase()
	const direction = searchParams.sort === 'asc' ? 'ASC' : 'DESC'
	const filters = [
		// Native PostgreSQL exposes bytea (\\x), while tiered views expose hex
		// text (0x). Compare the selector bytes after either two-character prefix.
		`(t."to" = '${account}' AND lower(substring(t.input::text FROM 3 FOR 8)) = '${SUBMIT_BATCH_SELECTOR.slice(2)}') IS NOT TRUE`,
		// Use a scalar JSON-path predicate: TIDX does not allow table functions.
		// Match destination and selector in the same call.
		`(t.calls::jsonb @? '$[*] ? (
			@.to like_regex "^${account}$" flag "i" && (
				@.input like_regex "^${SUBMIT_BATCH_SELECTOR}" flag "i" ||
				@.data like_regex "^${SUBMIT_BATCH_SELECTOR}" flag "i"
			)
		)') IS NOT TRUE`,
	]
	if (searchParams.cursor) {
		const cursor: unknown = JSON.parse(atob(searchParams.cursor))
		if (
			!Array.isArray(cursor) ||
			cursor.length !== 2 ||
			!cursor.every(
				(value) =>
					typeof value === 'number' &&
					Number.isSafeInteger(value) &&
					value >= 0,
			)
		)
			throw new Error('Invalid history cursor')
		filters.push(
			`(t.block_num, t.idx) ${direction === 'ASC' ? '>' : '<'} (${cursor[0]}, ${cursor[1]})`,
		)
	}
	if (searchParams.after !== undefined)
		filters.push(
			`t.block_timestamp >= '${new Date(searchParams.after * 1000).toISOString()}'`,
		)
	if (searchParams.status)
		filters.push(`r.status = ${searchParams.status === 'success' ? 1 : 0}`)
	const sides =
		searchParams.include === 'sent'
			? ['from']
			: searchParams.include === 'received'
				? ['to']
				: ['from', 'to']
	// Separate address indexes avoid a broad OR scan. Exclude batches before
	// pagination and fetch receipts only for the visible page.
	const results = await Promise.all(
		sides.map(async (side) => {
			const response = await api.v1.indexer.query.$get({
				query: {
					chainId: String(chainId),
					sql: `SELECT t.hash, t.block_num, t.idx FROM txs AS t
			${searchParams.status ? 'JOIN receipts AS r ON r.tx_hash = t.hash' : ''}
			WHERE t."${side}" = '${account}' AND ${filters.join(' AND ')}
			ORDER BY t.block_num + 0 ${direction}, t.idx ${direction}
			LIMIT ${limit + 1}`,
				},
			})
			// Preserve query-rejection details; tidx.ts 0.1.2 only reads `message`,
			// while the indexer returns its diagnostic in `error`.
			if (response.status === 422)
				throw new Error(
					`Indexer query rejected: ${(await response.json()).error}`,
				)
			const result = await parseResponse(response)
			return {
				rows: result.rows.map((values) =>
					Object.fromEntries(
						result.columns.map((name, i) => [name, values[i]]),
					),
				),
			}
		}),
	)
	const positions = new Map<
		string,
		{ hash: Hex.Hex; block: number; index: number }
	>()
	for (const result of results)
		for (const row of result.rows) {
			const hash = String(row.hash)
			Hex.assert(hash)
			positions.set(hash.toLowerCase(), {
				hash,
				block: Number(row.block_num),
				index: Number(row.idx),
			})
		}
	const rows = [...positions.values()].sort(
		(a, b) =>
			(direction === 'ASC' ? 1 : -1) * (a.block - b.block || a.index - b.index),
	)
	const page = rows.slice(0, limit)
	const data = await Promise.all(
		page.map(async (row) => {
			const response = await parseResponse(
				api.v1.transactions[':transactionHash'].$get({
					param: { transactionHash: row.hash },
					query: { chainId: String(chainId), include: 'receipt' },
				}),
			)
			return response
		}),
	)
	const cursorFor = (row: (typeof rows)[number]) =>
		btoa(JSON.stringify([row.block, row.index]))
	const last = page.at(-1)
	return {
		data,
		reverseCursor: page[0] ? cursorFor(page[0]) : null,
		nextCursor: rows.length > limit && last ? cursorFor(last) : null,
	}
}

/**
 * Resolves TIP-20 metadata for every token referenced by the page's event
 * logs (symbol/decimals for the known-event summaries).
 */
async function buildTokenMetadataLookup(
	rows: readonly TransactionRow[],
): Promise<(address: Address.Address) => Metadata | undefined> {
	const config = getWagmiConfig()
	const tokenAddresses = new Set<Address.Address>()
	for (const row of rows) {
		for (const log of row.meta?.receipt?.logs ?? []) {
			if (isTip20Address(log.address)) {
				tokenAddresses.add(log.address as Address.Address)
			}
		}
	}

	const entries = await Promise.all(
		[...tokenAddresses].map(async (token) => {
			try {
				const metadata = await Actions.token.getMetadata(config as Config, {
					token,
				})
				return [token.toLowerCase(), metadata] as const
			} catch {
				return [token.toLowerCase(), undefined] as const
			}
		}),
	)
	const metadataByToken = new Map<string, Metadata | undefined>(entries)
	return (address) => metadataByToken.get(address.toLowerCase())
}

/** Maps an API transaction row (+ embedded receipt) to the UI contract. */
export function toEnrichedTransaction(
	row: TransactionRow,
	options: {
		includeKnownEvents: boolean
		getTokenMetadata: (address: Address.Address) => Metadata | undefined
		activities?: TransactionActivity[] | undefined
	},
): EnrichedTransaction {
	const receipt = row.meta?.receipt
	const status = receipt?.status ?? 'success'
	const to = row.recipient ? Address.checksum(row.recipient) : null

	const knownEvents = (() => {
		if (!options.includeKnownEvents || !receipt) return []
		const transaction = {
			to,
			input: row.input,
			data: row.input,
			calls: row.meta?.rpc?.calls as never,
		}
		const activityEvents = activitiesToKnownEvents(options.activities ?? [])
		try {
			const parsedEvents = parseKnownEvents(
				{
					from: receipt.sender,
					to,
					status,
					logs: receipt.logs as unknown as Log[],
					contractAddress: receipt.contractAddress ?? null,
				} as unknown as TransactionReceipt,
				{
					transaction,
					getTokenMetadata: options.getTokenMetadata,
				},
			)
			const knownCall = decodeKnownTransactionCall(transaction)
			const fallbackEvents = knownCall
				? [knownCall, ...parsedEvents.filter((event) => event.type !== 'fee')]
				: parsedEvents
			return selectTransactionDescriptionEvents({
				activityEvents,
				fallbackEvents,
				knownCall,
			})
		} catch (error) {
			console.error(
				`[history] failed to parse known events for ${row.hash}:`,
				error,
			)
			return activityEvents
		}
	})()

	return {
		hash: row.hash,
		blockNumber: toHexQuantity(row.blockNumber),
		timestamp: parseTimestamp(row.timestamp) ?? 0,
		from: Address.checksum(row.sender),
		to,
		value: toHexQuantity(row.value),
		status,
		gasUsed: toHexQuantity(receipt?.gasUsed),
		effectiveGasPrice: toHexQuantity(receipt?.effectiveGasPrice),
		knownEvents: serializeBigInts(knownEvents),
	}
}

export async function fetchAddressHistoryData(params: {
	address: Address.Address
	chainId: number
	searchParams: HistoryRequestParameters
	maxLimit?: number | undefined
	includeKnownEvents?: boolean | undefined
}): Promise<HistoryResponse> {
	const { address, chainId, searchParams } = params
	const maxLimit = params.maxLimit ?? MAX_LIMIT
	const includeKnownEvents = params.includeKnownEvents ?? true

	let limit = Number.isFinite(searchParams.limit)
		? Math.floor(searchParams.limit)
		: DEFAULT_LIMIT
	if (limit > maxLimit) throw new Error('Limit is too high')
	if (limit < 1) limit = 1

	const filters = historyFilters(address, searchParams)
	const hideSubmitBatches =
		searchParams.hideSubmitBatches === 'true' && isZonePortalAddress(address)
	const totalKey = JSON.stringify([chainId, filters])
	const cachedTotal = getCachedHistoryTotal(totalKey)
	// Only the latest edge refreshes the count. The oldest edge is fetched in
	// parallel with ascending order and reuses the same cached total.
	const includeTotal =
		!hideSubmitBatches &&
		searchParams.cursor === undefined &&
		searchParams.sort === 'desc' &&
		cachedTotal === undefined
	const resultPromise = hideSubmitBatches
		? fetchFilteredHistoryPage(address, chainId, searchParams, limit)
		: parseResponse(
				api.v1.transactions.$get({
					query: {
						chainId: String(chainId),
						...filters,
						order: searchParams.sort,
						limit: String(limit),
						...(searchParams.cursor ? { cursor: searchParams.cursor } : {}),
						include: includeTotal ? 'receipt,totalCount' : 'receipt',
					},
				}),
			)
	const requestedTotal = includeTotal
		? resultPromise
				.then((result) =>
					result.meta?.totalCount === undefined
						? undefined
						: {
								totalCount: result.meta.totalCount,
								totalCountCapped: result.meta.totalCountCapped ?? false,
							},
				)
				.catch(() => undefined)
		: undefined
	if (requestedTotal) cacheHistoryTotal(totalKey, requestedTotal)

	const [result, exactTotal] = await Promise.all([
		resultPromise,
		hideSubmitBatches ? undefined : (cachedTotal ?? requestedTotal),
	])

	const [getTokenMetadata, activities] = await Promise.all([
		includeKnownEvents
			? buildTokenMetadataLookup(result.data)
			: Promise.resolve(() => undefined),
		includeKnownEvents
			? Promise.all(
					result.data.map((row) => getTransactionActivities(row.hash, chainId)),
				)
			: Promise.resolve([]),
	])

	const transactions = result.data.map((row, index) =>
		toEnrichedTransaction(row, {
			includeKnownEvents,
			getTokenMetadata,
			activities: activities[index],
		}),
	)
	if (searchParams.sort === 'asc') transactions.reverse()

	return {
		transactions,
		total: exactTotal?.totalCount ?? null,
		limit,
		nextCursor: result.nextCursor,
		reverseCursor:
			'reverseCursor' in result &&
			(typeof result.reverseCursor === 'string' ||
				result.reverseCursor === null)
				? result.reverseCursor
				: result.data[0]
					? transactionCursor(result.data[0])
					: null,
		countCapped: exactTotal?.totalCountCapped ?? false,
		error: null,
	}
}
