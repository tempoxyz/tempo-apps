import type { Config } from 'wagmi'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { Log, TransactionReceipt } from 'viem'
import { parseEventLogs } from 'viem'
import { Abis } from '#lib/abis'
import { Actions } from 'wagmi/tempo'
import * as z from 'zod/mini'

import { parseKnownEvents } from '#lib/domain/known-events'
import { isTip20Address, type Metadata } from '#lib/domain/tip20'
import { getTempoEnv } from '#lib/env'
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
	type AddressHistoryLogRow,
	type AddressHistoryReceiptRow,
	type AddressHistoryTxDetailsRow,
	type SortDirection,
} from '#lib/server/tempo-queries'
import { getBatchedClient, getWagmiConfig } from '#wagmi.config'

const abi = Object.values(Abis).flat()

export const [MAX_LIMIT, DEFAULT_LIMIT] = [100, 10]
const HISTORY_COUNT_MAX = 10_000
const CSV_EXPORT_LIMIT = HISTORY_COUNT_MAX
const CSV_EXPORT_PAGE_SIZE = MAX_LIMIT
const LOCALNET_HISTORY_BLOCK_BATCH_SIZE = 64
const LOCALNET_HISTORY_BLOCK_SCAN_LIMIT = 10_000
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

function topicToAddress(topic: Hex.Hex | undefined): string | null {
	if (!topic) return null
	return `0x${topic.slice(-40)}`.toLowerCase()
}

function logMatchesTransferDirection(
	log: Pick<Log, 'topics'>,
	addressKey: string,
	includeSent: boolean,
	includeReceived: boolean,
): boolean {
	const [topic0, fromTopic, toTopic] = log.topics
	if (topic0?.toLowerCase() !== TRANSFER_EVENT_TOPIC0) return false

	const from = topicToAddress(fromTopic)
	const to = topicToAddress(toTopic)

	return (
		(includeSent && from === addressKey) ||
		(includeReceived && to === addressKey)
	)
}

function logIsTransferEmittedByAddress(
	log: Pick<Log, 'address' | 'topics'>,
	addressKey: string,
): boolean {
	return (
		log.address.toLowerCase() === addressKey &&
		log.topics[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC0
	)
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

type LocalnetHistoryRecord = {
	hash: Hex.Hex
	blockNumber: bigint
	blockTimestamp: number
	transactionIndex: number
	transaction: {
		hash: Hex.Hex
		from: Address.Address
		to: Address.Address | null
		value?: bigint
		input?: Hex.Hex
		data?: Hex.Hex
		calls?: unknown
	}
	receipt: TransactionReceipt
}

type LocalnetAddressHistoryParams = {
	address: Address.Address
	searchParams: HistoryRequestParameters
	includeKnownEvents: boolean
	includeSent: boolean
	includeReceived: boolean
	sortDirection: SortDirection
	offset: number
	limit: number
	after?: number | undefined
	sources: Sources
	statusFilter?: 'success' | 'reverted' | undefined
}

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

async function formatLocalnetAddressHistoryData(
	params: LocalnetAddressHistoryParams,
	records: LocalnetHistoryRecord[],
	scanLimitReached: boolean,
): Promise<HistoryResponse> {
	const sortedRecords = [...records].sort((a, b) => {
		if (a.blockNumber !== b.blockNumber) {
			return params.sortDirection === 'desc'
				? Number(b.blockNumber - a.blockNumber)
				: Number(a.blockNumber - b.blockNumber)
		}
		if (a.transactionIndex !== b.transactionIndex) {
			return params.sortDirection === 'desc'
				? b.transactionIndex - a.transactionIndex
				: a.transactionIndex - b.transactionIndex
		}
		return params.sortDirection === 'desc'
			? b.hash.localeCompare(a.hash)
			: a.hash.localeCompare(b.hash)
	})
	const countCapped =
		sortedRecords.length > HISTORY_COUNT_MAX || scanLimitReached
	const cappedRecords = countCapped
		? sortedRecords.slice(0, HISTORY_COUNT_MAX)
		: sortedRecords
	const paginatedRecords = cappedRecords.slice(
		params.offset,
		params.offset + params.limit + 1,
	)
	const hasMore = paginatedRecords.length > params.limit
	const finalRecords = hasMore
		? paginatedRecords.slice(0, params.limit)
		: paginatedRecords

	if (finalRecords.length === 0) {
		return {
			transactions: [],
			total: cappedRecords.length,
			offset: params.offset,
			limit: params.limit,
			hasMore: false,
			countCapped,
			error: null,
		}
	}

	const hashes: HistoryHashEntry[] = finalRecords.map((record) => ({
		hash: record.hash,
		block_num: record.blockNumber,
		from: record.transaction.from,
		to: record.transaction.to,
		value: record.transaction.value ?? 0n,
	}))
	const txRows: AddressHistoryTxDetailsRow[] = finalRecords.map((record) => ({
		hash: record.hash,
		block_num: record.blockNumber,
		block_timestamp: record.blockTimestamp,
		from: record.transaction.from,
		to: record.transaction.to,
		value: record.transaction.value ?? 0n,
		input: record.transaction.input ?? record.transaction.data ?? '0x',
		calls: record.transaction.calls ?? null,
	}))
	const receiptRows: AddressHistoryReceiptRow[] = finalRecords.map(
		(record) => ({
			tx_hash: record.hash,
			block_num: record.blockNumber,
			block_timestamp: record.blockTimestamp,
			from: record.receipt.from,
			to: record.receipt.to,
			status: record.receipt.status === 'reverted' ? 0 : 1,
			gas_used: record.receipt.gasUsed,
			effective_gas_price: record.receipt.effectiveGasPrice,
			contract_address: record.receipt.contractAddress ?? null,
		}),
	)
	const logRows: AddressHistoryLogRow[] = finalRecords.flatMap((record) =>
		record.receipt.logs.map((log) => ({
			tx_hash: record.hash,
			block_num: record.blockNumber,
			tx_idx: record.transactionIndex,
			log_idx: log.logIndex,
			address: log.address as Address.Address,
			topic0: log.topics[0] ?? null,
			topic1: log.topics[1] ?? null,
			topic2: log.topics[2] ?? null,
			topic3: log.topics[3] ?? null,
			data: log.data,
			is_virtual_forward: false,
		})),
	)

	const transactions = params.includeKnownEvents
		? await buildTxOnlyTransactions({
				address: params.address,
				hashes,
				txRows,
				receiptRows,
				logRows,
			})
		: hashes.map((hashEntry) => {
				const receipt = receiptRows.find(
					(row) => row.tx_hash === hashEntry.hash,
				)
				const tx = txRows.find((row) => row.hash === hashEntry.hash)
				const fromSource = tx?.from ?? receipt?.from ?? params.address
				const toSource = tx?.to ?? receipt?.to ?? null

				return {
					hash: hashEntry.hash,
					blockNumber: toHexQuantity(tx?.block_num ?? receipt?.block_num),
					timestamp: toFiniteTimestamp(
						tx?.block_timestamp ?? receipt?.block_timestamp,
					),
					from: Address.checksum(fromSource as Address.Address),
					to: toSource ? Address.checksum(toSource as Address.Address) : null,
					value: toHexQuantity(tx?.value ?? hashEntry.value),
					status: toHistoryStatus(receipt?.status),
					gasUsed: toHexQuantity(receipt?.gas_used),
					effectiveGasPrice: toHexQuantity(receipt?.effective_gas_price),
					knownEvents: [],
				}
			})

	return {
		transactions,
		total: cappedRecords.length,
		offset: params.offset,
		limit: params.limit,
		hasMore,
		countCapped,
		error: null,
	}
}

type OtsSearchTransactionsResult = {
	txs?: OtsTransaction[]
	receipts?: OtsReceipt[]
	lastPage?: boolean
}

type OtsTransaction = {
	hash?: unknown
	from?: unknown
	to?: unknown
	value?: unknown
	input?: unknown
	data?: unknown
	calls?: unknown
	blockNumber?: unknown
	blockTimestamp?: unknown
	transactionIndex?: unknown
}

type OtsReceipt = {
	transactionHash?: unknown
	from?: unknown
	to?: unknown
	status?: unknown
	gasUsed?: unknown
	effectiveGasPrice?: unknown
	contractAddress?: unknown
	logs?: OtsLog[]
	blockNumber?: unknown
	blockTimestamp?: unknown
	transactionIndex?: unknown
}

type OtsLog = {
	address?: unknown
	data?: unknown
	topics?: unknown
	blockNumber?: unknown
	transactionHash?: unknown
	transactionIndex?: unknown
	logIndex?: unknown
	removed?: unknown
}

function parseHex(value: unknown): Hex.Hex | null {
	return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)
		? (value as Hex.Hex)
		: null
}

function parseAddress(value: unknown): Address.Address | null {
	return typeof value === 'string' && Address.validate(value)
		? (value as Address.Address)
		: null
}

function parseQuantity(value: unknown): bigint {
	if (typeof value === 'bigint') return value
	if (typeof value === 'number' && Number.isFinite(value)) return BigInt(value)
	if (typeof value === 'string') {
		try {
			return BigInt(value)
		} catch {
			return 0n
		}
	}
	return 0n
}

function parseQuantityAsNumber(value: unknown): number {
	const parsed = parseQuantity(value)
	return parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : 0
}

function normalizeOtsLog(
	log: OtsLog,
	fallback: {
		blockNumber: bigint
		transactionHash: Hex.Hex
		transactionIndex: number
	},
): Log | null {
	const address = parseAddress(log.address)
	if (!address) return null

	return {
		address,
		data: parseHex(log.data) ?? '0x',
		topics: Array.isArray(log.topics)
			? log.topics.flatMap((topic) => {
					const parsed = parseHex(topic)
					return parsed ? [parsed] : []
				})
			: [],
		blockNumber: parseQuantity(log.blockNumber) || fallback.blockNumber,
		transactionHash: parseHex(log.transactionHash) ?? fallback.transactionHash,
		transactionIndex:
			parseQuantityAsNumber(log.transactionIndex) || fallback.transactionIndex,
		logIndex: parseQuantityAsNumber(log.logIndex),
		removed: log.removed === true,
	} as Log
}

function otsTransactionToRecord(
	transaction: OtsTransaction,
	receipt: OtsReceipt | undefined,
): LocalnetHistoryRecord | null {
	const hash = parseHex(transaction.hash)
	const from = parseAddress(transaction.from)
	if (!hash || !from) return null

	const blockNumber = parseQuantity(
		transaction.blockNumber ?? receipt?.blockNumber,
	)
	const transactionIndex = parseQuantityAsNumber(
		transaction.transactionIndex ?? receipt?.transactionIndex,
	)
	const blockTimestamp = parseQuantityAsNumber(
		transaction.blockTimestamp ?? receipt?.blockTimestamp,
	)
	const to = parseAddress(transaction.to)
	const receiptFrom = parseAddress(receipt?.from) ?? from
	const receiptTo = parseAddress(receipt?.to) ?? to
	const contractAddress = parseAddress(receipt?.contractAddress)
	const status = parseQuantity(receipt?.status) === 0n ? 'reverted' : 'success'
	const normalizedLogs = (receipt?.logs ?? []).flatMap((log) => {
		const normalized = normalizeOtsLog(log, {
			blockNumber,
			transactionHash: hash,
			transactionIndex,
		})
		return normalized ? [normalized] : []
	})

	return {
		hash,
		blockNumber,
		blockTimestamp,
		transactionIndex,
		transaction: {
			hash,
			from,
			to,
			value: parseQuantity(transaction.value),
			input: parseHex(transaction.input) ?? undefined,
			data: parseHex(transaction.data) ?? undefined,
			calls: transaction.calls,
		},
		receipt: {
			transactionHash: hash,
			from: receiptFrom,
			to: receiptTo,
			status,
			gasUsed: parseQuantity(receipt?.gasUsed),
			effectiveGasPrice: parseQuantity(receipt?.effectiveGasPrice),
			contractAddress,
			logs: normalizedLogs,
		} as TransactionReceipt,
	}
}

async function fetchLocalnetAddressHistoryDataFromOts(
	params: LocalnetAddressHistoryParams,
): Promise<HistoryResponse | null> {
	if (params.sortDirection !== 'desc') return null

	const client = getBatchedClient()
	const latestBlock = await client.getBlockNumber()
	if (latestBlock >= BigInt(Number.MAX_SAFE_INTEGER - 1)) return null

	const requestSize = Math.min(
		Math.max(params.offset + params.limit + 1, params.limit * 5),
		HISTORY_COUNT_MAX + 1,
	)
	const result = (await client.request({
		method: 'ots_searchTransactionsBefore',
		params: [params.address, Number(latestBlock + 1n), requestSize],
	} as Parameters<typeof client.request>[0])) as OtsSearchTransactionsResult

	const receiptsByHash = new Map(
		(result.receipts ?? []).flatMap((receipt) => {
			const hash = parseHex(receipt.transactionHash)
			return hash ? [[hash.toLowerCase(), receipt] as const] : []
		}),
	)
	const addressKey = params.address.toLowerCase()
	const records = (result.txs ?? []).flatMap((transaction) => {
		const hash = parseHex(transaction.hash)
		if (!hash) return []

		const record = otsTransactionToRecord(
			transaction,
			receiptsByHash.get(hash.toLowerCase()),
		)
		if (!record) return []

		const directMatch =
			params.sources.txs &&
			((params.includeSent &&
				record.transaction.from.toLowerCase() === addressKey) ||
				(params.includeReceived &&
					record.transaction.to?.toLowerCase() === addressKey) ||
				(params.includeReceived &&
					record.receipt.contractAddress?.toLowerCase() === addressKey))
		const transferMatch =
			params.sources.transfers &&
			record.receipt.logs.some((log) =>
				logMatchesTransferDirection(
					log,
					addressKey,
					params.includeSent,
					params.includeReceived,
				),
			)
		const emittedMatch =
			params.sources.emitted &&
			record.receipt.logs.some((log) =>
				logIsTransferEmittedByAddress(log, addressKey),
			)

		if (!directMatch && !transferMatch && !emittedMatch) return []
		if (
			params.statusFilter &&
			record.receipt.status !==
				(params.statusFilter === 'reverted' ? 'reverted' : 'success')
		) {
			return []
		}
		if (params.after && record.blockTimestamp < params.after) return []

		return [record]
	})

	return formatLocalnetAddressHistoryData(
		params,
		records,
		result.lastPage !== true || (result.txs?.length ?? 0) >= HISTORY_COUNT_MAX,
	)
}

async function fetchLocalnetAddressHistoryData(
	params: LocalnetAddressHistoryParams,
): Promise<HistoryResponse> {
	try {
		const otsHistory = await fetchLocalnetAddressHistoryDataFromOts(params)
		if (otsHistory) return otsHistory
	} catch (error) {
		console.warn('[history] localnet ots history unavailable:', error)
	}

	return fetchLocalnetAddressHistoryDataFromScan(params)
}

async function fetchLocalnetAddressHistoryDataFromScan(
	params: LocalnetAddressHistoryParams,
): Promise<HistoryResponse> {
	const client = getBatchedClient()
	const latestBlock = await client.getBlockNumber()
	const addressKey = params.address.toLowerCase()
	const records: LocalnetHistoryRecord[] = []
	const countCap = HISTORY_COUNT_MAX + 1
	let scannedBlocks = 0
	let scanLimitReached = false

	let batchEnd = latestBlock
	while (batchEnd >= 0n && scannedBlocks < LOCALNET_HISTORY_BLOCK_SCAN_LIMIT) {
		const remainingScanBudget =
			LOCALNET_HISTORY_BLOCK_SCAN_LIMIT - scannedBlocks
		const batchSize = Math.min(
			LOCALNET_HISTORY_BLOCK_BATCH_SIZE,
			remainingScanBudget,
		)
		const batchSpan = BigInt(batchSize - 1)
		const batchStart = batchEnd > batchSpan ? batchEnd - batchSpan : 0n
		const blockNumbers: bigint[] = []
		for (
			let blockNumber = batchEnd;
			blockNumber >= batchStart;
			blockNumber -= 1n
		) {
			blockNumbers.push(blockNumber)
			if (blockNumber === 0n) break
		}
		scannedBlocks += blockNumbers.length

		const blocks = await Promise.all(
			blockNumbers.map((blockNumber) =>
				client.getBlock({
					blockNumber,
					includeTransactions: true,
				}),
			),
		)

		let shouldStop = false
		for (const block of blocks) {
			const blockTimestamp = Number(block.timestamp)

			if (params.after && blockTimestamp < params.after) {
				shouldStop = true
				break
			}

			const transactions = block.transactions.filter(
				(transaction) => typeof transaction !== 'string',
			)

			for (const transaction of transactions) {
				const receipt = await client.getTransactionReceipt({
					hash: transaction.hash,
				})

				const directMatch =
					params.sources.txs &&
					((params.includeSent &&
						transaction.from.toLowerCase() === addressKey) ||
						(params.includeReceived &&
							transaction.to?.toLowerCase() === addressKey) ||
						(params.includeReceived &&
							receipt.contractAddress?.toLowerCase() === addressKey))
				const transferMatch =
					params.sources.transfers &&
					receipt.logs.some((log) =>
						logMatchesTransferDirection(
							log,
							addressKey,
							params.includeSent,
							params.includeReceived,
						),
					)
				const emittedMatch =
					params.sources.emitted &&
					receipt.logs.some((log) =>
						logIsTransferEmittedByAddress(log, addressKey),
					)

				if (!directMatch && !transferMatch && !emittedMatch) continue

				if (
					params.statusFilter &&
					receipt.status !==
						(params.statusFilter === 'reverted' ? 'reverted' : 'success')
				) {
					continue
				}

				records.push({
					hash: transaction.hash,
					blockNumber: block.number,
					blockTimestamp,
					transactionIndex: receipt.transactionIndex,
					transaction: transaction as LocalnetHistoryRecord['transaction'],
					receipt,
				})

				if (records.length >= countCap) {
					shouldStop = true
					break
				}
			}

			if (shouldStop) break
		}

		if (shouldStop || batchStart === 0n) break
		if (scannedBlocks >= LOCALNET_HISTORY_BLOCK_SCAN_LIMIT) {
			scanLimitReached = true
			break
		}
		batchEnd = batchStart - 1n
	}

	if (scannedBlocks >= LOCALNET_HISTORY_BLOCK_SCAN_LIMIT) {
		const oldestScannedBlock =
			latestBlock >= BigInt(scannedBlocks - 1)
				? latestBlock - BigInt(scannedBlocks - 1)
				: 0n
		scanLimitReached = oldestScannedBlock > 0n
	}

	return formatLocalnetAddressHistoryData(params, records, scanLimitReached)
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

	if (getTempoEnv() === 'localnet') {
		return fetchLocalnetAddressHistoryData({
			address,
			searchParams,
			includeKnownEvents,
			includeSent,
			includeReceived,
			sortDirection,
			offset,
			limit,
			after,
			sources,
			statusFilter,
		})
	}

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
