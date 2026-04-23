import type { Config } from 'wagmi'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { Log, TransactionReceipt } from 'viem'
import { parseEventLogs } from 'viem'
import { Abis } from 'viem/tempo'
import { Actions } from 'wagmi/tempo'
import * as z from 'zod/mini'

import { parseKnownEvents } from '#lib/domain/known-events'
import { isTip20Address, type Metadata } from '#lib/domain/tip20'
import {
	buildCsv,
	createCsvDownloadResponse,
	createTimestampedCsvFilename,
} from '#lib/server/csv'
import {
	buildTxOnlyTransactions,
	type EnrichedTransaction,
	type HistoryHashEntry,
} from '#lib/server/build-tx-only-transactions'
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
import { getWagmiConfig } from '#wagmi.config'

const abi = Object.values(Abis).flat()

export const [MAX_LIMIT, DEFAULT_LIMIT] = [100, 10]
const HISTORY_COUNT_MAX = 10_000
const CSV_EXPORT_LIMIT = HISTORY_COUNT_MAX
const CSV_EXPORT_PAGE_SIZE = MAX_LIMIT
const TRANSFER_EVENT_TOPIC0 =
	'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex.Hex

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

export type HistoryResponse = {
	transactions: EnrichedTransaction[]
	total: number
	offset: number
	limit: number
	hasMore: boolean
	countCapped: boolean
	error: null | string
}

type Sources = { txs: boolean; transfers: boolean; emitted: boolean }

function parseSources(val: string | undefined): Sources {
	if (!val) return { txs: true, transfers: true, emitted: false }
	const parts = val.split(',').map((value) => value.trim().toLowerCase())
	return {
		txs: parts.includes('txs'),
		transfers: parts.includes('transfers'),
		emitted: parts.includes('emitted'),
	}
}

export const RequestParametersSchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
	sources: z.optional(z.string()),
	status: z.optional(z.enum(['success', 'reverted'])),
	after: z.optional(z.coerce.number()),
})

export type HistoryRequestParameters = z.infer<typeof RequestParametersSchema>

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
	const config = getWagmiConfig()

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
		Number.isFinite(searchParams.offset) ? Math.floor(searchParams.offset) : 0,
	)

	let limit = Number.isFinite(searchParams.limit)
		? Math.floor(searchParams.limit)
		: DEFAULT_LIMIT

	if (limit > maxLimit) throw new Error('Limit is too high')
	if (limit < 1) limit = 1

	const after = searchParams.after
	const includeSent = include === 'all' || include === 'sent'
	const includeReceived = include === 'all' || include === 'received'
	const sources = parseSources(searchParams.sources)
	const statusFilter = searchParams.status

	const fetchSize = limit + 1
	const isTxOnlySource = sources.txs && !sources.transfers && !sources.emitted

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

		const [directResult, transferResult, emittedResult] = await Promise.all([
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

		for (const row of directResult) {
			allHashes.set(row.hash, {
				hash: row.hash,
				block_num: row.block_num,
				from: row.from,
				to: row.to,
				value: row.value,
			})
		}
		for (const row of transferResult) {
			if (!allHashes.has(row.tx_hash)) {
				allHashes.set(row.tx_hash, {
					hash: row.tx_hash,
					block_num: row.block_num,
				})
			}
		}
		for (const row of emittedResult) {
			if (!allHashes.has(row.tx_hash)) {
				allHashes.set(row.tx_hash, {
					hash: row.tx_hash,
					block_num: row.block_num,
				})
			}
		}

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

		if (statusFilter) {
			const hashValues = sortedHashes.map((hashEntry) => hashEntry.hash)
			const receipts = await fetchAddressReceiptRowsByHashes(
				chainId,
				hashValues,
			)
			const statusMap = new Map(
				receipts.map((row) => [row.tx_hash, row.status]),
			)
			const targetStatus = statusFilter === 'reverted' ? 0 : 1
			sortedHashes = sortedHashes.filter(
				(hashEntry) => statusMap.get(hashEntry.hash) === targetStatus,
			)
		}

		const paginatedHashes = sortedHashes.slice(offset, offset + fetchSize)
		hasMore = paginatedHashes.length > limit
		finalHashes = hasMore ? paginatedHashes.slice(0, limit) : paginatedHashes

		if (statusFilter) {
			totalCount = sortedHashes.length
			countCapped = false
		} else {
			totalCount = countResult.count
			countCapped = countResult.capped
		}
	}

	if (finalHashes.length === 0) {
		return {
			transactions: [],
			total: totalCount,
			offset,
			limit,
			hasMore: false,
			countCapped,
			error: null,
		}
	}

	const finalHashValues = finalHashes.map((entry) => entry.hash)

	const [receiptRows, txRows] = await Promise.all([
		txOnlyPageResult
			? Promise.resolve(txOnlyPageResult.receiptRows)
			: fetchAddressReceiptRowsByHashes(chainId, finalHashValues),
		txOnlyPageResult
			? Promise.resolve(txOnlyPageResult.txRows)
			: fetchAddressHistoryTxDetailsByHashes(chainId, finalHashValues),
	])

	const receiptMap = new Map(
		receiptRows.map((row) => [row.tx_hash, row] as const),
	)
	const txMap = new Map(txRows.map((row) => [row.hash, row] as const))

	if (!includeKnownEvents) {
		const transactions = finalHashes.map((hashEntry) => {
			const receipt = receiptMap.get(hashEntry.hash)
			const tx = txMap.get(hashEntry.hash)

			const fromSource = tx?.from ?? hashEntry.from ?? receipt?.from ?? address
			const toSource = tx?.to ?? hashEntry.to ?? receipt?.to ?? null
			const valueSource = tx?.value ?? hashEntry.value ?? 0n
			const blockNumberSource =
				receipt?.block_num ?? tx?.block_num ?? hashEntry.block_num
			const timestampSource =
				receipt?.block_timestamp ?? tx?.block_timestamp ?? 0
			const status = toHistoryStatus(receipt?.status)

			return {
				hash: hashEntry.hash,
				blockNumber: toHexQuantity(blockNumberSource),
				timestamp: toFiniteTimestamp(timestampSource),
				from: Address.checksum(fromSource as Address.Address),
				to: toSource ? Address.checksum(toSource as Address.Address) : null,
				value: toHexQuantity(valueSource),
				status,
				gasUsed: toHexQuantity(receipt?.gas_used),
				effectiveGasPrice: toHexQuantity(receipt?.effective_gas_price),
				knownEvents: [],
			}
		})

		const finalTransactions = after
			? transactions.filter((transaction) => transaction.timestamp >= after)
			: transactions

		return {
			transactions: finalTransactions,
			total: after ? finalTransactions.length : totalCount,
			offset,
			limit,
			hasMore: after ? false : hasMore,
			countCapped: after ? false : countCapped,
			error: null,
		}
	}

	if (isTxOnlySource) {
		if (!txOnlyPageResult) {
			throw new Error('Missing tx-only history page result')
		}

		const transactions = await buildTxOnlyTransactions({
			address,
			hashes: finalHashes,
			txRows,
			receiptRows,
			logRows: txOnlyPageResult.logRows,
		})

		return {
			transactions,
			total: totalCount,
			offset,
			limit,
			hasMore,
			countCapped,
			error: null,
		}
	}

	const [logRows, transferRows] = await Promise.all([
		fetchAddressLogRowsByTxHashes(chainId, finalHashValues),
		fetchAddressTransferRowsByTxHashes(chainId, finalHashValues),
	])

	const logsByHash = new Map<Hex.Hex, Log[]>()

	for (const row of logRows) {
		const topics = [row.topic0, row.topic1, row.topic2, row.topic3].filter(
			(topic): topic is Hex.Hex => Boolean(topic),
		)

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
		if (txLogs) txLogs.push(log)
		else logsByHash.set(row.tx_hash, [log])
	}

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
		if (txLogs) txLogs.push(log)
		else logsByHash.set(row.tx_hash, [log])
	}

	const allLogs: Log[] = []
	for (const txLogs of logsByHash.values()) {
		allLogs.push(...txLogs)
	}

	const events = (() => {
		try {
			return parseEventLogs({ abi, logs: allLogs })
		} catch (error) {
			console.error('[history] failed to parse logs for metadata:', error)
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
				const metadata = await Actions.token.getMetadata(config as Config, {
					token,
				})
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

		const fromSource = tx?.from ?? hashEntry.from ?? receipt?.from ?? address
		const toSource = tx?.to ?? hashEntry.to ?? receipt?.to ?? null
		const valueSource = tx?.value ?? hashEntry.value ?? 0n
		const blockNumberSource =
			receipt?.block_num ?? tx?.block_num ?? hashEntry.block_num
		const timestampSource = receipt?.block_timestamp ?? tx?.block_timestamp ?? 0
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
					calls: Array.isArray(tx.calls) ? (tx.calls as never) : undefined,
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
			to: toSource ? Address.checksum(toSource as Address.Address) : null,
			value: toHexQuantity(valueSource),
			status,
			gasUsed: toHexQuantity(receipt?.gas_used),
			effectiveGasPrice: toHexQuantity(receipt?.effective_gas_price),
			knownEvents: serializeBigInts(knownEvents),
		})
	}

	const finalTransactions = after
		? transactions.filter((transaction) => transaction.timestamp >= after)
		: transactions

	return {
		transactions: finalTransactions,
		total: after ? finalTransactions.length : totalCount,
		offset,
		limit,
		hasMore: after ? false : hasMore,
		countCapped: after ? false : countCapped,
		error: null,
	}
}

export async function fetchAddressHistoryExportRows(params: {
	address: Address.Address
	chainId: number
	searchParams: HistoryRequestParameters
}): Promise<ReadonlyArray<EnrichedTransaction>> {
	const transactions: EnrichedTransaction[] = []
	let offset = 0

	while (transactions.length < CSV_EXPORT_LIMIT) {
		const pageLimit = Math.min(
			CSV_EXPORT_PAGE_SIZE,
			CSV_EXPORT_LIMIT - transactions.length,
		)
		const page = await fetchAddressHistoryData({
			address: params.address,
			chainId: params.chainId,
			searchParams: {
				...params.searchParams,
				offset,
				limit: pageLimit,
			},
			maxLimit: CSV_EXPORT_PAGE_SIZE,
			includeKnownEvents: false,
		})

		if (page.transactions.length === 0) break

		transactions.push(...page.transactions)
		if (!page.hasMore) break

		offset += page.transactions.length
	}

	return transactions
}
