import { type InferResponseType, parseResponse } from 'hono/client'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { Log, TransactionReceipt } from 'viem'
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

export const [MAX_LIMIT, DEFAULT_LIMIT] = [10, 10]
const HISTORY_TOTAL_CACHE_TTL = 60_000
const HISTORY_TOTAL_CACHE_MAX_ENTRIES = 50

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
	const totalKey = JSON.stringify([chainId, filters])
	const cachedTotal = getCachedHistoryTotal(totalKey)
	// Only the latest edge refreshes the count. The oldest edge is fetched in
	// parallel with ascending order and reuses the same cached total.
	const includeTotal =
		searchParams.cursor === undefined &&
		searchParams.sort === 'desc' &&
		cachedTotal === undefined
	const resultPromise = parseResponse(
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
		cachedTotal ?? requestedTotal,
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
		reverseCursor: result.data[0] ? transactionCursor(result.data[0]) : null,
		countCapped: exactTotal?.totalCountCapped ?? false,
		error: null,
	}
}
