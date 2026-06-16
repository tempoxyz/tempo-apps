import { type InferResponseType, parseResponse } from 'hono/client'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { Log, TransactionReceipt } from 'viem'
import type { Config } from 'wagmi'
import { Actions } from 'wagmi/tempo'
import * as z from 'zod/mini'

import { type KnownEvent, parseKnownEvents } from '#lib/domain/known-events'
import { isTip20Address, type Metadata } from '#lib/domain/tip20'
import {
	buildCsv,
	createCsvDownloadResponse,
	createTimestampedCsvFilename,
} from '#lib/server/csv'
import { api } from '#lib/server/tempo-api'
import { fetchAddressTxExportRows } from '#lib/server/tempo-queries'
import { resolveTotal } from '#lib/server/token'
import { parseTimestamp } from '#lib/timestamp'
import { getWagmiConfig } from '#wagmi.config'

export const [MAX_LIMIT, DEFAULT_LIMIT] = [100, 10]
/** The API's positional-pagination window: `page × limit` must stay within. */
const HISTORY_COUNT_MAX = 10_000
const CSV_EXPORT_LIMIT = HISTORY_COUNT_MAX

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
	page: number
	limit: number
	hasMore: boolean
	countCapped: boolean
	error: null | string
}

export const RequestParametersSchema = z.object({
	page: z.prefault(z.coerce.number(), 1),
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
	status: z.optional(z.enum(['success', 'reverted'])),
	after: z.optional(z.coerce.number()),
})

export type HistoryRequestParameters = z.infer<typeof RequestParametersSchema>

type TransactionRow = InferResponseType<
	typeof api.v1.transactions.$get,
	200
>['data'][number]

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
	},
): EnrichedTransaction {
	const receipt = row.meta?.receipt
	const status = receipt?.status ?? 'success'
	const to = row.recipient ? Address.checksum(row.recipient) : null

	const knownEvents = (() => {
		if (!options.includeKnownEvents || !receipt) return []
		try {
			return parseKnownEvents(
				{
					from: receipt.sender,
					to,
					status,
					logs: receipt.logs as unknown as Log[],
					contractAddress: receipt.contractAddress ?? null,
				} as unknown as TransactionReceipt,
				{
					transaction: {
						to,
						input: row.input,
						data: row.input,
						calls: row.meta?.rpc?.calls as never,
					} as never,
					getTokenMetadata: options.getTokenMetadata,
				},
			)
		} catch (error) {
			console.error(
				`[history] failed to parse known events for ${row.hash}:`,
				error,
			)
			return []
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

	const page = Math.max(
		1,
		Number.isFinite(searchParams.page) ? Math.floor(searchParams.page) : 1,
	)
	let limit = Number.isFinite(searchParams.limit)
		? Math.floor(searchParams.limit)
		: DEFAULT_LIMIT
	if (limit > maxLimit) throw new Error('Limit is too high')
	if (limit < 1) limit = 1

	const emptyResponse: HistoryResponse = {
		transactions: [],
		total: 0,
		page,
		limit,
		hasMore: false,
		countCapped: false,
		error: null,
	}
	// Beyond the API's positional window — callers can't reach this via the UI
	// (totals are clamped page-aligned below), but guard direct requests.
	if (page * limit > HISTORY_COUNT_MAX) return emptyResponse

	// `include=sent|received` narrows the side; `all` matches either side.
	const sideFilter =
		searchParams.include === 'sent'
			? { sender: address }
			: searchParams.include === 'received'
				? { recipient: address }
				: { address }

	const result = await parseResponse(
		api.v1.transactions.$get({
			query: {
				chainId: String(chainId),
				...sideFilter,
				...(searchParams.status ? { status: searchParams.status } : {}),
				...(searchParams.after
					? {
							'timestamp.from': new Date(
								searchParams.after * 1000,
							).toISOString(),
						}
					: {}),
				order: searchParams.sort,
				limit: String(limit),
				...(page > 1 ? { page: String(page) } : {}),
				include: 'receipt,totalCount',
			},
		}),
	)

	const getTokenMetadata = includeKnownEvents
		? await buildTokenMetadataLookup(result.data)
		: () => undefined

	const transactions = result.data.map((row) =>
		toEnrichedTransaction(row, { includeKnownEvents, getTokenMetadata }),
	)

	const { total, totalCapped } = resolveTotal({
		exactCount: result.meta?.totalCount,
		exactCountCapped: result.meta?.totalCountCapped,
		page,
		limit,
		rows: transactions.length,
		exhausted: result.nextCursor === null,
	})

	return {
		transactions,
		total,
		page,
		limit,
		hasMore: result.nextCursor !== null,
		countCapped: totalCapped,
		error: null,
	}
}

/**
 * Bulk rows for the CSV export in one SQL round-trip (the per-page API walk
 * with embedded receipts is far too slow at the 10k export cap).
 */
export async function fetchAddressHistoryExportRows(params: {
	address: Address.Address
	chainId: number
	searchParams: HistoryRequestParameters
}): Promise<ReadonlyArray<EnrichedTransaction>> {
	const { searchParams } = params

	const rows = await fetchAddressTxExportRows({
		address: params.address,
		chainId: params.chainId,
		includeSent: searchParams.include !== 'received',
		includeReceived: searchParams.include !== 'sent',
		status: searchParams.status,
		after: searchParams.after,
		sortDirection: searchParams.sort,
		limit: CSV_EXPORT_LIMIT,
	})

	return rows.map((row) => ({
		hash: row.hash,
		blockNumber: toHexQuantity(row.block_num),
		timestamp: parseTimestamp(row.block_timestamp) ?? 0,
		from: Address.checksum(row.from as Address.Address),
		to: row.to ? Address.checksum(row.to as Address.Address) : null,
		value: toHexQuantity(row.value),
		status: row.status === 0 ? 'reverted' : 'success',
		gasUsed: toHexQuantity(row.gas_used),
		effectiveGasPrice: toHexQuantity(row.effective_gas_price),
		knownEvents: [],
	}))
}

function hexToDecimalString(value: string | null | undefined): string {
	if (!value) return ''

	try {
		return BigInt(value).toString()
	} catch {
		return ''
	}
}

export function createTransactionsCsvResponse(params: {
	address: Address.Address
	transactions: ReadonlyArray<EnrichedTransaction>
}): Response {
	const rows: Array<ReadonlyArray<unknown>> = [
		[
			'timestamp_iso',
			'timestamp_unix',
			'status',
			'direction',
			'hash',
			'block_number',
			'from',
			'to',
			'value_wei',
			'gas_used',
			'effective_gas_price_wei',
			'fee_wei',
		],
	]

	for (const transaction of params.transactions) {
		const gasUsed = hexToDecimalString(transaction.gasUsed)
		const effectiveGasPrice = hexToDecimalString(transaction.effectiveGasPrice)
		const feeWei =
			gasUsed && effectiveGasPrice
				? (BigInt(gasUsed) * BigInt(effectiveGasPrice)).toString()
				: ''

		const direction = Address.isEqual(transaction.from, params.address)
			? transaction.to && Address.isEqual(transaction.to, params.address)
				? 'self'
				: 'sent'
			: transaction.to && Address.isEqual(transaction.to, params.address)
				? 'received'
				: 'related'

		rows.push([
			transaction.timestamp > 0
				? new Date(transaction.timestamp * 1000).toISOString()
				: '',
			transaction.timestamp,
			transaction.status,
			direction,
			transaction.hash,
			hexToDecimalString(transaction.blockNumber),
			transaction.from,
			transaction.to,
			hexToDecimalString(transaction.value),
			gasUsed,
			effectiveGasPrice,
			feeWei,
		])
	}

	return createCsvDownloadResponse({
		csv: buildCsv(rows),
		filename: createTimestampedCsvFilename('transactions', params.address),
		headers: {
			'X-Tempo-Export-Row-Limit': String(CSV_EXPORT_LIMIT),
		},
	})
}
