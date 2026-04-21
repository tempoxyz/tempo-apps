import type { Address, Hex } from 'ox'
import * as OxHash from 'ox/Hash'
import * as OxHex from 'ox/Hex'
import { Tidx } from 'tidx.ts'
import { decodeAbiParameters, zeroAddress } from 'viem'
import * as ABIS from '#lib/abis'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import { parseTimestamp } from '#lib/timestamp'

const QB = tempoQueryBuilder

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

type SortDirection = 'asc' | 'desc'

type QueryWithWhere<TQuery> = TQuery & {
	where: (...args: unknown[]) => TQuery
}

export type TokenHolderBalance = { address: string; balance: bigint }

type TokenHolderAggregationRow = {
	from: string
	to: string
	tokens: string | number | bigint
}

export type TokenHoldersCountRow = {
	token: string
	count: number
	capped: boolean
}

function sortTokenHolderBalances(
	balances: Map<string, bigint>,
): TokenHolderBalance[] {
	return Array.from(balances.entries())
		.filter(([, balance]) => balance > 0n)
		.map(([holder, balance]) => ({ address: holder, balance }))
		.sort((a, b) => (b.balance > a.balance ? 1 : -1))
}

function aggregateTokenHolderBalances(
	rows: TokenHolderAggregationRow[],
): TokenHolderBalance[] {
	const balances = new Map<string, bigint>()

	for (const row of rows) {
		const tokens = BigInt(row.tokens)
		if (row.to !== zeroAddress) {
			balances.set(row.to, (balances.get(row.to) ?? 0n) + tokens)
		}
		if (row.from !== zeroAddress) {
			balances.set(row.from, (balances.get(row.from) ?? 0n) - tokens)
		}
	}

	return sortTokenHolderBalances(balances)
}

export async function fetchTokenHolderBalances(
	address: Address.Address,
	chainId: number,
): Promise<TokenHolderBalance[]> {
	const qb = QB(chainId).withSignatures([TRANSFER_SIGNATURE])
	const transfers = (await qb
		.selectFrom('transfer')
		.select((eb) => [
			eb.ref('from').as('from'),
			eb.ref('to').as('to'),
			eb.fn.sum('tokens').as('tokens'),
		])
		.where('address', '=', address)
		.groupBy(['from', 'to'])
		.execute()) as TokenHolderAggregationRow[]

	return aggregateTokenHolderBalances(transfers)
}

export async function fetchTokenHoldersCountRows(
	addresses: Address.Address[],
	chainId: number,
	countCap: number,
): Promise<TokenHoldersCountRow[]> {
	if (addresses.length === 0) return []

	const qb = QB(chainId).withSignatures([TRANSFER_SIGNATURE])
	const transfers = (await qb
		.selectFrom('transfer')
		.select((eb) => [
			eb.ref('address').as('address'),
			eb.ref('from').as('from'),
			eb.ref('to').as('to'),
			eb.fn.sum('tokens').as('tokens'),
		])
		.where('address', 'in', addresses)
		.groupBy(['address', 'from', 'to'])
		.execute()) as Array<{
		address: string
		from: string
		to: string
		tokens: string | number | bigint
	}>

	const balancesByToken = new Map<string, Map<string, bigint>>()

	for (const row of transfers) {
		const token = row.address.toLowerCase()
		let tokenBalances = balancesByToken.get(token)
		if (!tokenBalances) {
			tokenBalances = new Map<string, bigint>()
			balancesByToken.set(token, tokenBalances)
		}

		const tokens = BigInt(row.tokens)
		if (row.to !== zeroAddress) {
			const to = row.to.toLowerCase()
			tokenBalances.set(to, (tokenBalances.get(to) ?? 0n) + tokens)
		}
		if (row.from !== zeroAddress) {
			const from = row.from.toLowerCase()
			tokenBalances.set(from, (tokenBalances.get(from) ?? 0n) - tokens)
		}
	}

	return addresses.map((address) => {
		const token = address.toLowerCase()
		const tokenBalances = balancesByToken.get(token)
		const rawCount = tokenBalances
			? Array.from(tokenBalances.values()).reduce(
					(acc, balance) => (balance > 0n ? acc + 1 : acc),
					0,
				)
			: 0
		const capped = rawCount >= countCap
		return {
			token,
			count: capped ? countCap : rawCount,
			capped,
		}
	})
}

/**
 * The tidx server silently caps query results at this many rows.
 * Queries that would return more get truncated without any error or metadata.
 */
const TIDX_SERVER_ROW_LIMIT = 10_000

function isTidxQueryTooExpensiveError(error: unknown): boolean {
	if (error instanceof Tidx.FetchRequestError && error.status === 422)
		return true
	if (error instanceof Error && error.cause)
		return isTidxQueryTooExpensiveError(error.cause)
	return false
}

export async function fetchTokenHoldersCount(
	address: Address.Address,
	chainId: number,
	countCap: number,
): Promise<{ count: number; capped: boolean }> {
	try {
		const qb = QB(chainId).withSignatures([TRANSFER_SIGNATURE])
		const transfers = (await qb
			.selectFrom('transfer')
			.select((eb) => [
				eb.ref('from').as('from'),
				eb.ref('to').as('to'),
				eb.fn.sum('tokens').as('tokens'),
			])
			.where('address', '=', address)
			.groupBy(['from', 'to'])
			.execute()) as TokenHolderAggregationRow[]

		// The tidx server caps results at 10,000 rows. If we hit that ceiling,
		// the data is truncated and the in-memory aggregation would be incorrect.
		// Return a capped count instead of computing from incomplete data.
		if (transfers.length >= TIDX_SERVER_ROW_LIMIT) {
			return { count: countCap, capped: true }
		}

		const holders = aggregateTokenHolderBalances(transfers)
		const rawCount = holders.length
		const capped = rawCount >= countCap

		return {
			count: capped ? countCap : rawCount,
			capped,
		}
	} catch (error) {
		// Only return a capped fallback for 422 (query too expensive, i.e. too many holders).
		// For other errors (auth, network, 5xx), re-throw so callers handle them normally.
		if (isTidxQueryTooExpensiveError(error)) {
			console.error(
				`[tidx] holders count query failed for ${address} (422), returning capped`,
			)
			return { count: countCap, capped: true }
		}

		throw error
	}
}

export async function fetchTokenFirstTransferTimestamp(
	address: Address.Address,
	chainId: number,
): Promise<number | null> {
	const qb = QB(chainId).withSignatures([TRANSFER_SIGNATURE])

	const firstTransfer = await qb
		.selectFrom('transfer')
		.select(['block_timestamp'])
		.where('address', '=', address)
		.orderBy('block_num', 'asc')
		.limit(1)
		.executeTakeFirst()

	return firstTransfer?.block_timestamp
		? Number(firstTransfer.block_timestamp)
		: null
}

export type TokenTransferRow = {
	from: Address.Address
	to: Address.Address
	tokens: bigint
	tx_hash: Hex.Hex
	block_num: bigint
	log_idx: number
	block_timestamp: string | number | null
}

export async function fetchTokenTransfers(
	address: Address.Address,
	chainId: number,
	limit: number,
	offset: number,
	account?: Address.Address,
): Promise<TokenTransferRow[]> {
	let query = QB(chainId)
		.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select([
			'from',
			'to',
			'tokens',
			'tx_hash',
			'block_num',
			'log_idx',
			'block_timestamp',
		])
		.where('address', '=', address)

	if (account) {
		query = query.where((eb) =>
			eb.or([eb('from', '=', account), eb('to', '=', account)]),
		)
	}

	const result = await query
		.orderBy('block_num', 'desc')
		.orderBy('log_idx', 'desc')
		.limit(limit)
		.offset(offset)
		.execute()

	return result.map((row) => ({
		from: row.from,
		to: row.to,
		tokens: BigInt(row.tokens),
		tx_hash: row.tx_hash,
		block_num: row.block_num,
		log_idx: Number(row.log_idx),
		block_timestamp: row.block_timestamp ?? null,
	}))
}

export async function fetchTokenTransferCount(
	address: Address.Address,
	chainId: number,
	countCap: number,
	account?: Address.Address,
): Promise<{ count: number; capped: boolean }> {
	const qb = QB(chainId)
	let subquery = qb
		.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select((eb) => eb.lit(1).as('x'))
		.where('address', '=', address)

	if (account) {
		subquery = subquery.where((eb) =>
			eb.or([eb('from', '=', account), eb('to', '=', account)]),
		)
	}

	const result = await qb
		.selectFrom(subquery.limit(countCap).as('subquery'))
		.select((eb) => eb.fn.count('x').as('count'))
		.executeTakeFirst()

	const count = Number(result?.count ?? 0)
	const capped = count >= countCap

	return { count, capped }
}

export type TokenCreatedRow = {
	token: Address.Address
	symbol: string
	name: string
	currency: string
	block_timestamp: string | number
}

export async function fetchTokenCreatedRows(
	chainId: number,
	limit: number,
	offset: number,
): Promise<TokenCreatedRow[]> {
	const eventSignature = ABIS.getTokenCreatedEvent(chainId)

	return QB(chainId)
		.withSignatures([eventSignature])
		.selectFrom('tokencreated')
		.select(['token', 'symbol', 'name', 'currency', 'block_timestamp'])
		.orderBy('block_num', 'desc')
		.limit(limit)
		.offset(offset)
		.execute()
}

export async function fetchTokenCreatedCount(
	chainId: number,
	countLimit: number,
): Promise<number> {
	const eventSignature = ABIS.getTokenCreatedEvent(chainId)
	const qb = QB(chainId)

	const result = await qb
		.selectFrom(
			qb
				.withSignatures([eventSignature])
				.selectFrom('tokencreated')
				.select((eb) => eb.lit(1).as('x'))
				.limit(countLimit)
				.as('subquery'),
		)
		.select((eb) => eb.fn.count('x').as('count'))
		.executeTakeFirst()

	return Number(result?.count ?? 0)
}

export async function fetchTokenCreatedMetadata(
	chainId: number,
	tokens: Address.Address[],
): Promise<
	Array<{
		token: string
		name: string
		symbol: string
		currency: string
		block_timestamp: string | number | null
	}>
> {
	if (tokens.length === 0) return []

	const tokenCreatedSignature = ABIS.getTokenCreatedEvent(chainId)
	const topic0 = OxHash.keccak256(
		OxHex.fromString(tokenCreatedSignature.replace(/^event /, '')),
	)

	const tokenTopics = tokens.map(
		(token) =>
			`0x${token.toLowerCase().replace(/^0x/, '').padStart(64, '0')}` as Hex.Hex,
	)

	const rows = await QB(chainId)
		.selectFrom('logs')
		.select(['topic1', 'data', 'block_timestamp'])
		.where('topic0', '=', topic0)
		.where('topic1', 'in', tokenTopics as never)
		.execute()

	const dataParams = [
		{ name: 'name', type: 'string' },
		{ name: 'symbol', type: 'string' },
		{ name: 'currency', type: 'string' },
		{ name: 'quoteToken', type: 'address' },
		{ name: 'admin', type: 'address' },
		{ name: 'salt', type: 'bytes32' },
	] as const

	const results: Array<{
		token: string
		name: string
		symbol: string
		currency: string
		block_timestamp: string | number | null
	}> = []

	for (const row of rows) {
		if (!row.topic1 || !row.data) continue

		try {
			const decoded = decodeAbiParameters(dataParams, row.data as Hex.Hex)
			results.push({
				token: `0x${(row.topic1 as string).slice(-40)}`,
				name: decoded[0] as string,
				symbol: decoded[1] as string,
				currency: decoded[2] as string,
				block_timestamp:
					typeof row.block_timestamp === 'number' ||
					typeof row.block_timestamp === 'string'
						? row.block_timestamp
						: null,
			})
		} catch {}
	}

	return results
}
export async function fetchTransactionTimestamp(
	chainId: number,
	hash: Hex.Hex,
): Promise<number | undefined> {
	const result = await QB(chainId)
		.selectFrom('txs')
		.select(['block_timestamp'])
		.where('hash', '=', hash)
		.limit(1)
		.executeTakeFirst()

	return result?.block_timestamp ? Number(result.block_timestamp) : undefined
}

export async function fetchLatestBlockNumber(chainId: number): Promise<bigint> {
	const result = await QB(chainId)
		.selectFrom('blocks')
		.select('num')
		.orderBy('num', 'desc')
		.limit(1)
		.executeTakeFirstOrThrow()

	return BigInt(result.num)
}

export async function fetchGenesisBlockTimestamp(
	chainId: number,
): Promise<string | number | bigint | null> {
	const result = await QB(chainId)
		.selectFrom('blocks')
		.select('timestamp')
		.orderBy('num', 'asc')
		.limit(1)
		.executeTakeFirst()

	return result?.timestamp ?? null
}

type AddressDirectionParams = {
	address: Address.Address
	chainId: number
	includeSent: boolean
	includeReceived: boolean
}

type AddressHistoryCountParams = AddressDirectionParams & {
	includeTxs: boolean
	includeTransfers: boolean
	includeEmitted: boolean
	countCap: number
}

function applyAddressDirectionFilter<TQuery>(
	query: QueryWithWhere<TQuery>,
	params: AddressDirectionParams,
): TQuery {
	const { address, includeSent, includeReceived } = params
	if (includeSent && includeReceived) {
		return query.where(
			// @ts-expect-error
			(eb) => eb.or([eb('from', '=', address), eb('to', '=', address)]),
		) as TQuery
	}
	if (includeSent) {
		return query.where('from', '=', address) as TQuery
	}
	return query.where('to', '=', address) as TQuery
}

export type DirectTxHashRow = { hash: Hex.Hex; block_num: bigint }

export async function fetchAddressDirectTxHashes(
	params: AddressDirectionParams & {
		sortDirection: SortDirection
		limit: number
	},
): Promise<DirectTxHashRow[]> {
	let directQuery = QB(params.chainId)
		.selectFrom('txs')
		.select(['hash', 'block_num'])

	directQuery = applyAddressDirectionFilter(directQuery, params)

	return directQuery
		.orderBy('block_num', params.sortDirection)
		.orderBy('hash', params.sortDirection)
		.limit(params.limit)
		.execute()
}

export type DirectTxHistoryRow = {
	hash: Hex.Hex
	block_num: bigint
	from: string
	to: string | null
	value: bigint
}

export async function fetchAddressDirectTxHistoryRows(
	params: AddressDirectionParams & {
		sortDirection: SortDirection
		limit: number
		offset?: number
	},
): Promise<DirectTxHistoryRow[]> {
	let directQuery = QB(params.chainId)
		.selectFrom('txs')
		.select(['hash', 'block_num', 'from', 'to', 'value'])

	directQuery = applyAddressDirectionFilter(directQuery, params)

	return directQuery
		.orderBy('block_num', params.sortDirection)
		.orderBy('hash', params.sortDirection)
		.offset(Math.max(0, params.offset ?? 0))
		.limit(params.limit)
		.execute()
}

export type TransferHashRow = { tx_hash: Hex.Hex; block_num: bigint }

export async function fetchAddressTransferHashes(
	params: AddressDirectionParams & {
		sortDirection: SortDirection
		limit: number
	},
): Promise<TransferHashRow[]> {
	let transferQuery = QB(params.chainId)
		.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select(['tx_hash', 'block_num'])
		.distinct()

	transferQuery = applyAddressDirectionFilter(transferQuery, params)

	return transferQuery
		.orderBy('block_num', params.sortDirection)
		.orderBy('tx_hash', params.sortDirection)
		.limit(params.limit)
		.execute()
}

export async function fetchAddressTransferEmittedHashes(params: {
	address: Address.Address
	chainId: number
	sortDirection: SortDirection
	limit: number
}): Promise<TransferHashRow[]> {
	return QB(params.chainId)
		.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select(['tx_hash', 'block_num'])
		.distinct()
		.where('address', '=', params.address)
		.orderBy('block_num', params.sortDirection)
		.orderBy('tx_hash', params.sortDirection)
		.limit(params.limit)
		.execute()
}

export async function fetchAddressDirectTxCount(
	params: AddressDirectionParams & {
		countCap: number
		statusFilter?: 'success' | 'reverted'
		after?: number
	},
): Promise<number> {
	const qb = QB(params.chainId)
	let subquery = qb.selectFrom('txs').select((eb) => eb.lit(1).as('x'))

	subquery = applyAddressDirectionFilter(subquery, params)

	if (params.statusFilter) {
		const statusValue = params.statusFilter === 'reverted' ? 0 : 1
		subquery = subquery
			.innerJoin('receipts', 'receipts.tx_hash', 'txs.hash')
			.where('receipts.status', '=', statusValue) as typeof subquery
	}

	if (params.after) {
		subquery = subquery.where(
			'block_timestamp',
			'>=',
			params.after,
		) as typeof subquery
	}

	const result = await qb
		.selectFrom(subquery.limit(params.countCap).as('subquery'))
		.select((eb) => eb.fn.count('x').as('count'))
		.executeTakeFirst()

	return Number(result?.count ?? 0)
}

export async function fetchAddressTransferDistinctCount(
	params: AddressDirectionParams & { countCap: number },
): Promise<number> {
	const qb = QB(params.chainId)
	let subquery = qb
		.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select('tx_hash')
		.distinct()

	subquery = applyAddressDirectionFilter(subquery, params)

	const result = await qb
		.selectFrom(subquery.limit(params.countCap).as('subquery'))
		.select((eb) => eb.fn.count('tx_hash').as('count'))
		.executeTakeFirst()

	return Number(result?.count ?? 0)
}

export async function fetchAddressTransferEmittedDistinctCount(params: {
	address: Address.Address
	chainId: number
	countCap: number
}): Promise<number> {
	const qb = QB(params.chainId)
	const subquery = qb
		.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select('tx_hash')
		.distinct()
		.where('address', '=', params.address)

	const result = await qb
		.selectFrom(subquery.limit(params.countCap).as('subquery'))
		.select((eb) => eb.fn.count('tx_hash').as('count'))
		.executeTakeFirst()

	return Number(result?.count ?? 0)
}

export async function fetchAddressHistoryDistinctCount(
	params: AddressHistoryCountParams,
): Promise<{ count: number; capped: boolean }> {
	const [directCount, transferCount, emittedCount] = await Promise.all([
		params.includeTxs
			? fetchAddressDirectTxCount({
					address: params.address,
					chainId: params.chainId,
					includeSent: params.includeSent,
					includeReceived: params.includeReceived,
					countCap: params.countCap,
				})
			: 0,
		params.includeTransfers
			? fetchAddressTransferDistinctCount({
					address: params.address,
					chainId: params.chainId,
					includeSent: params.includeSent,
					includeReceived: params.includeReceived,
					countCap: params.countCap,
				}).catch((error) => {
					console.error('[tidx] transfer count query failed:', error)
					return 0
				})
			: 0,
		params.includeEmitted
			? fetchAddressTransferEmittedDistinctCount({
					address: params.address,
					chainId: params.chainId,
					countCap: params.countCap,
				}).catch((error) => {
					console.error('[tidx] emitted count query failed:', error)
					return 0
				})
			: 0,
	])

	const total = Math.min(
		directCount + transferCount + emittedCount,
		params.countCap,
	)
	const capped =
		total >= params.countCap ||
		directCount >= params.countCap ||
		transferCount >= params.countCap ||
		emittedCount >= params.countCap

	return { count: total, capped }
}

export type TxDataRow = {
	hash: Hex.Hex
	block_num: bigint
	from: string
	to: string | null
	value: bigint
	input: Hex.Hex
	nonce: bigint
	gas: bigint
	gas_price: bigint
	type: bigint
}

export async function fetchTxDataByHashes(
	chainId: number,
	hashes: Hex.Hex[],
): Promise<TxDataRow[]> {
	if (hashes.length === 0) return []

	const result = await QB(chainId)
		.selectFrom('txs')
		.select([
			'hash',
			'block_num',
			'from',
			'to',
			'value',
			'input',
			'nonce',
			'gas_limit',
			'max_fee_per_gas',
			'type',
		])
		.where('hash', 'in', hashes)
		.execute()

	return result.map((row) => ({
		hash: row.hash,
		block_num: row.block_num,
		from: row.from,
		to: row.to,
		value: row.value,
		input: row.input,
		nonce: row.nonce,
		gas: row.gas_limit,
		gas_price: row.max_fee_per_gas,
		type: BigInt(row.type),
	}))
}

export type BasicTxRow = {
	hash: Hex.Hex
	from: string
	to: string | null
	value: bigint
}

export type AddressHistoryTxDetailsRow = {
	hash: Hex.Hex
	block_num: bigint
	block_timestamp: number
	from: string
	to: string | null
	value: bigint
	input: Hex.Hex
	calls: unknown
}

export async function fetchAddressHistoryTxDetailsByHashes(
	chainId: number,
	hashes: Hex.Hex[],
): Promise<AddressHistoryTxDetailsRow[]> {
	if (hashes.length === 0) return []

	return QB(chainId)
		.selectFrom('txs')
		.select([
			'hash',
			'block_num',
			'block_timestamp',
			'from',
			'to',
			'value',
			'input',
			'calls',
		])
		.where('hash', 'in', hashes)
		.execute()
}

export type AddressHistoryReceiptRow = {
	tx_hash: Hex.Hex
	block_num: bigint
	block_timestamp: number
	from: string
	to: string | null
	status: number | null
	gas_used: bigint
	effective_gas_price: bigint | null
	contract_address: string | null
}

export async function fetchAddressReceiptRowsByHashes(
	chainId: number,
	hashes: Hex.Hex[],
): Promise<AddressHistoryReceiptRow[]> {
	if (hashes.length === 0) return []

	return QB(chainId)
		.selectFrom('receipts')
		.select([
			'tx_hash',
			'block_num',
			'block_timestamp',
			'from',
			'to',
			'status',
			'gas_used',
			'effective_gas_price',
			'contract_address',
		])
		.where('tx_hash', 'in', hashes)
		.execute()
}

export type AddressHistoryLogRow = {
	tx_hash: Hex.Hex
	block_num: bigint
	tx_idx: number
	log_idx: number
	address: Address.Address
	topic0: Hex.Hex | null
	topic1: Hex.Hex | null
	topic2: Hex.Hex | null
	topic3: Hex.Hex | null
	data: Hex.Hex
}

export async function fetchAddressLogRowsByTxHashes(
	chainId: number,
	hashes: Hex.Hex[],
): Promise<AddressHistoryLogRow[]> {
	if (hashes.length === 0) return []

	return QB(chainId)
		.selectFrom('logs')
		.select([
			'tx_hash',
			'block_num',
			'tx_idx',
			'log_idx',
			'address',
			'topic0',
			'topic1',
			'topic2',
			'topic3',
			'data',
		])
		.where('tx_hash', 'in', hashes)
		.orderBy('tx_hash', 'asc')
		.orderBy('log_idx', 'asc')
		.execute()
}

type AddressTxOnlyHistoryJoinedQueryRow = {
	tx_hash: Hex.Hex | null
	tx_block_num: bigint | null
	tx_block_timestamp: number | null
	tx_from: string | null
	tx_to: string | null
	tx_value: bigint | null
	tx_input: Hex.Hex | null
	tx_calls: unknown
	receipt_block_num: bigint | null
	receipt_block_timestamp: number | null
	receipt_from: string | null
	receipt_to: string | null
	receipt_status: number | null
	receipt_gas_used: bigint | null
	receipt_effective_gas_price: bigint | null
	receipt_contract_address: string | null
	log_block_num: bigint | null
	log_tx_idx: number | null
	log_idx: number | null
	log_address: Address.Address | null
	log_topic0: Hex.Hex | null
	log_topic1: Hex.Hex | null
	log_topic2: Hex.Hex | null
	log_topic3: Hex.Hex | null
	log_data: Hex.Hex | null
}

export type AddressTxOnlyHistoryPageHash = {
	hash: Hex.Hex
	block_num: bigint
	from: string
	to: string | null
	value: bigint
}

export type AddressTxOnlyHistoryPageWithJoinsResult = {
	hashes: AddressTxOnlyHistoryPageHash[]
	txRows: AddressHistoryTxDetailsRow[]
	receiptRows: AddressHistoryReceiptRow[]
	logRows: AddressHistoryLogRow[]
	total: number
	countCapped: boolean
	hasMore: boolean
}

export async function fetchAddressTxOnlyHistoryPageWithJoins(
	params: AddressDirectionParams & {
		sortDirection: SortDirection
		offset: number
		limit: number
		countCap: number
		statusFilter?: 'success' | 'reverted'
		after?: number
	},
): Promise<AddressTxOnlyHistoryPageWithJoinsResult> {
	const fetchSize = params.limit + 1

	let filteredQuery = QB(params.chainId)
		.selectFrom('txs')
		.select([
			'hash',
			'block_num',
			'block_timestamp',
			'from',
			'to',
			'value',
			'input',
			'calls',
		])

	filteredQuery = applyAddressDirectionFilter(filteredQuery, params)

	if (params.statusFilter) {
		// Join with receipts to filter by status before pagination
		// status=1 means success, status=0 means reverted
		const statusValue = params.statusFilter === 'reverted' ? 0 : 1
		filteredQuery = filteredQuery
			.innerJoin('receipts', 'receipts.tx_hash', 'txs.hash')
			.where('receipts.status', '=', statusValue) as typeof filteredQuery
	}

	if (params.after) {
		filteredQuery = filteredQuery.where(
			'block_timestamp',
			'>=',
			params.after,
		) as typeof filteredQuery
	}

	const pagedQuery = filteredQuery
		.orderBy('block_num', params.sortDirection)
		.orderBy('hash', params.sortDirection)
		.offset(Math.max(0, params.offset))
		.limit(fetchSize)

	const rows = (await QB(params.chainId)
		.selectFrom(pagedQuery.as('paged'))
		.leftJoin('receipts', 'receipts.tx_hash', 'paged.hash')
		.leftJoin('logs', 'logs.tx_hash', 'paged.hash')
		.select([
			'paged.hash as tx_hash',
			'paged.block_num as tx_block_num',
			'paged.block_timestamp as tx_block_timestamp',
			'paged.from as tx_from',
			'paged.to as tx_to',
			'paged.value as tx_value',
			'paged.input as tx_input',
			'paged.calls as tx_calls',
			'receipts.block_num as receipt_block_num',
			'receipts.block_timestamp as receipt_block_timestamp',
			'receipts.from as receipt_from',
			'receipts.to as receipt_to',
			'receipts.status as receipt_status',
			'receipts.gas_used as receipt_gas_used',
			'receipts.effective_gas_price as receipt_effective_gas_price',
			'receipts.contract_address as receipt_contract_address',
			'logs.block_num as log_block_num',
			'logs.tx_idx as log_tx_idx',
			'logs.log_idx as log_idx',
			'logs.address as log_address',
			'logs.topic0 as log_topic0',
			'logs.topic1 as log_topic1',
			'logs.topic2 as log_topic2',
			'logs.topic3 as log_topic3',
			'logs.data as log_data',
		])
		.orderBy('paged.block_num', params.sortDirection)
		.orderBy('paged.hash', params.sortDirection)
		.orderBy('logs.log_idx', 'asc')
		.execute()) as AddressTxOnlyHistoryJoinedQueryRow[]

	const orderedHashMap = new Map<Hex.Hex, AddressTxOnlyHistoryPageHash>()
	for (const row of rows) {
		if (
			!row.tx_hash ||
			row.tx_block_num === null ||
			row.tx_from === null ||
			row.tx_value === null
		)
			continue

		if (!orderedHashMap.has(row.tx_hash)) {
			orderedHashMap.set(row.tx_hash, {
				hash: row.tx_hash,
				block_num: row.tx_block_num,
				from: row.tx_from,
				to: row.tx_to,
				value: row.tx_value,
			})
		}
	}

	const orderedHashes = [...orderedHashMap.values()]
	const hasMore = orderedHashes.length > params.limit
	const hashes = hasMore ? orderedHashes.slice(0, params.limit) : orderedHashes
	const selectedHashes = new Set(hashes.map((entry) => entry.hash))

	let total = 0
	let countCapped = false

	if (hasMore) {
		const directCount = await fetchAddressDirectTxCount({
			address: params.address,
			chainId: params.chainId,
			includeSent: params.includeSent,
			includeReceived: params.includeReceived,
			countCap: params.countCap,
			statusFilter: params.statusFilter,
			after: params.after,
		})
		total = directCount
		countCapped = directCount >= params.countCap
	} else {
		const exactCount = params.offset + hashes.length
		total = Math.min(exactCount, params.countCap)
		countCapped = exactCount >= params.countCap
	}

	const txMap = new Map<Hex.Hex, AddressHistoryTxDetailsRow>()
	const receiptMap = new Map<Hex.Hex, AddressHistoryReceiptRow>()
	const logRows: AddressHistoryLogRow[] = []
	const seenLogKeys = new Set<string>()

	for (const row of rows) {
		if (!row.tx_hash || !selectedHashes.has(row.tx_hash)) continue

		if (
			!txMap.has(row.tx_hash) &&
			row.tx_block_num !== null &&
			row.tx_block_timestamp !== null &&
			row.tx_from !== null &&
			row.tx_value !== null &&
			row.tx_input !== null
		) {
			txMap.set(row.tx_hash, {
				hash: row.tx_hash,
				block_num: row.tx_block_num,
				block_timestamp: row.tx_block_timestamp,
				from: row.tx_from,
				to: row.tx_to,
				value: row.tx_value,
				input: row.tx_input,
				calls: row.tx_calls,
			})
		}

		if (
			!receiptMap.has(row.tx_hash) &&
			row.receipt_block_num !== null &&
			row.receipt_block_timestamp !== null &&
			row.receipt_from !== null &&
			row.receipt_gas_used !== null
		) {
			receiptMap.set(row.tx_hash, {
				tx_hash: row.tx_hash,
				block_num: row.receipt_block_num,
				block_timestamp: row.receipt_block_timestamp,
				from: row.receipt_from,
				to: row.receipt_to,
				status: row.receipt_status,
				gas_used: row.receipt_gas_used,
				effective_gas_price: row.receipt_effective_gas_price,
				contract_address: row.receipt_contract_address,
			})
		}

		if (
			row.log_idx != null &&
			row.log_block_num != null &&
			row.log_tx_idx != null &&
			row.log_address != null &&
			row.log_data != null
		) {
			const logKey = `${row.tx_hash}:${row.log_idx}`
			if (!seenLogKeys.has(logKey)) {
				seenLogKeys.add(logKey)

				logRows.push({
					tx_hash: row.tx_hash,
					block_num: row.log_block_num,
					tx_idx: row.log_tx_idx,
					log_idx: row.log_idx,
					address: row.log_address,
					topic0: row.log_topic0,
					topic1: row.log_topic1,
					topic2: row.log_topic2,
					topic3: row.log_topic3,
					data: row.log_data,
				})
			}
		}
	}

	return {
		hashes,
		txRows: [...txMap.values()],
		receiptRows: [...receiptMap.values()],
		logRows,
		total,
		countCapped,
		hasMore,
	}
}

export type AddressHistoryTransferRow = {
	tx_hash: Hex.Hex
	block_num: bigint
	log_idx: number
	address: Address.Address
	from: Address.Address
	to: Address.Address
	tokens: bigint
}

export async function fetchAddressTransferRowsByTxHashes(
	chainId: number,
	hashes: Hex.Hex[],
): Promise<AddressHistoryTransferRow[]> {
	if (hashes.length === 0) return []

	return QB(chainId)
		.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select([
			'tx_hash',
			'block_num',
			'log_idx',
			'address',
			'from',
			'to',
			'tokens',
		])
		.where('tx_hash', 'in', hashes)
		.orderBy('tx_hash', 'asc')
		.orderBy('log_idx', 'asc')
		.execute()
}

export async function fetchBasicTxDataByHashes(
	chainId: number,
	hashes: Hex.Hex[],
): Promise<BasicTxRow[]> {
	if (hashes.length === 0) return []

	return QB(chainId)
		.selectFrom('txs')
		.select(['hash', 'from', 'to', 'value'])
		.where('hash', 'in', hashes)
		.execute()
}

export async function fetchContractCreationTxCandidates(
	chainId: number,
	creationBlock: bigint,
): Promise<Array<{ hash: Hex.Hex; block_num: bigint }>> {
	return QB(chainId)
		.selectFrom('txs')
		.select(['hash', 'block_num'])
		.where('to', '=', zeroAddress)
		.where('block_num', '=', creationBlock)
		.execute()
}

export async function fetchAddressTransferBalances(
	address: Address.Address,
	chainId: number,
): Promise<
	Array<{ token: string; received: string | number; sent: string | number }>
> {
	const [incoming, outgoing] = await Promise.all([
		QB(chainId)
			.withSignatures([TRANSFER_SIGNATURE])
			.selectFrom('transfer')
			.select((eb) => [
				eb.ref('address').as('token'),
				eb.fn.sum('tokens').as('received'),
			])
			.where('to', '=', address)
			.groupBy('address')
			.execute()
			.catch((e) => {
				console.error('[tidx] transfer incoming query failed:', e)
				return []
			}),
		QB(chainId)
			.withSignatures([TRANSFER_SIGNATURE])
			.selectFrom('transfer')
			.select((eb) => [
				eb.ref('address').as('token'),
				eb.fn.sum('tokens').as('sent'),
			])
			.where('from', '=', address)
			.groupBy('address')
			.execute()
			.catch((e) => {
				console.error('[tidx] transfer outgoing query failed:', e)
				return []
			}),
	])

	const merged = new Map<
		string,
		{ token: string; received: bigint; sent: bigint }
	>()

	for (const row of incoming) {
		const token = String(row.token).toLowerCase()
		merged.set(token, {
			token: row.token,
			received: BigInt(row.received ?? 0),
			sent: 0n,
		})
	}

	for (const row of outgoing) {
		const token = String(row.token).toLowerCase()
		const existing = merged.get(token)
		if (existing) {
			existing.sent = BigInt(row.sent ?? 0)
		} else {
			merged.set(token, {
				token: row.token,
				received: 0n,
				sent: BigInt(row.sent ?? 0),
			})
		}
	}

	return [...merged.values()].map((row) => ({
		token: row.token,
		received: row.received.toString(),
		sent: row.sent.toString(),
	}))
}

export async function fetchAddressTransfersForValue(
	address: Address.Address,
	chainId: number,
	limit: number,
): Promise<
	Array<{ address: string; from: string; to: string; tokens: string | number }>
> {
	const result = await QB(chainId)
		.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select(['address', 'from', 'to', 'tokens'])
		.where((eb) => eb.or([eb('from', '=', address), eb('to', '=', address)]))
		.limit(limit)
		.execute()

	return result.map((row) => ({
		...row,
		tokens: row.tokens as unknown as string | number,
	}))
}

export async function fetchTokenTransferAggregate(
	address: Address.Address,
	chainId: number,
): Promise<{
	oldestTimestamp?: unknown
	latestTimestamp?: unknown
}> {
	const result = await QB(chainId)
		.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select((sb) => [
			sb.fn.min('block_timestamp').as('oldestTimestamp'),
			sb.fn.max('block_timestamp').as('latestTimestamp'),
		])
		.where('address', '=', address)
		.executeTakeFirst()

	return {
		oldestTimestamp: result?.oldestTimestamp,
		latestTimestamp: result?.latestTimestamp,
	}
}

export async function fetchAddressTxAggregate(
	address: Address.Address,
	chainId: number,
): Promise<{
	count?: number
	latestTxsBlockTimestamp?: unknown
	oldestTxsBlockTimestamp?: unknown
	oldestTxHash?: string
	oldestTxFrom?: string
}> {
	type AddressTxBoundaryRow = {
		hash: Hex.Hex
		from: string
		block_timestamp: string | number | bigint | null
	}

	type AddressTxCountRow = {
		count: string | number | bigint
	}

	const countByField = async (field: 'from' | 'to'): Promise<number> => {
		const result = (await QB(chainId)
			.selectFrom('txs')
			.select((eb) => eb.fn.count('hash').as('count'))
			.where(field, '=', address)
			.executeTakeFirst()) as AddressTxCountRow | undefined

		return Number(result?.count ?? 0)
	}

	const fetchBoundaryByField = async (
		field: 'from' | 'to',
		sortDirection: SortDirection,
	): Promise<AddressTxBoundaryRow | undefined> =>
		(await QB(chainId)
			.selectFrom('txs')
			.select(['hash', 'from', 'block_timestamp'])
			.where(field, '=', address)
			.orderBy('block_timestamp', sortDirection)
			.orderBy('hash', sortDirection)
			.limit(1)
			.executeTakeFirst()) as AddressTxBoundaryRow | undefined

	const toComparableTimestamp = (value: unknown): number => {
		if (typeof value === 'bigint') return Number(value)
		return parseTimestamp(value) ?? Number.NaN
	}

	const pickBoundary = (
		sortDirection: SortDirection,
		rows: Array<AddressTxBoundaryRow | undefined>,
	): AddressTxBoundaryRow | undefined => {
		const presentRows = rows.filter((row) => row !== undefined)
		if (presentRows.length === 0) return undefined

		presentRows.sort((left, right) => {
			const leftTimestamp = toComparableTimestamp(left.block_timestamp)
			const rightTimestamp = toComparableTimestamp(right.block_timestamp)
			const timestampDiff =
				sortDirection === 'asc'
					? leftTimestamp - rightTimestamp
					: rightTimestamp - leftTimestamp
			if (timestampDiff !== 0) return timestampDiff

			return sortDirection === 'asc'
				? left.hash.localeCompare(right.hash)
				: right.hash.localeCompare(left.hash)
		})

		return presentRows[0]
	}

	const [
		sentCount,
		receivedCount,
		selfCount,
		latestSent,
		latestReceived,
		oldestSent,
		oldestReceived,
	] = await Promise.all([
		countByField('from'),
		countByField('to'),
		QB(chainId)
			.selectFrom('txs')
			.select((eb) => eb.fn.count('hash').as('count'))
			.where('from', '=', address)
			.where('to', '=', address)
			.executeTakeFirst()
			.then((result) =>
				Number((result as AddressTxCountRow | undefined)?.count ?? 0),
			),
		fetchBoundaryByField('from', 'desc'),
		fetchBoundaryByField('to', 'desc'),
		fetchBoundaryByField('from', 'asc'),
		fetchBoundaryByField('to', 'asc'),
	])

	const latest = pickBoundary('desc', [latestSent, latestReceived])
	const oldest = pickBoundary('asc', [oldestSent, oldestReceived])

	return {
		count: sentCount + receivedCount - selfCount,
		latestTxsBlockTimestamp: latest?.block_timestamp,
		oldestTxsBlockTimestamp: oldest?.block_timestamp,
		oldestTxHash: oldest?.hash as string | undefined,
		oldestTxFrom: oldest?.from as string | undefined,
	}
}

export async function fetchAddressTxCounts(
	address: Address.Address,
	chainId: number,
): Promise<{ sent: number; received: number }> {
	const qb = QB(chainId)
	const [txSentResult, txReceivedResult] = await Promise.all([
		qb
			.selectFrom('txs')
			.select((eb) => eb.fn.count('hash').as('cnt'))
			.where('from', '=', address)
			.executeTakeFirst(),
		qb
			.selectFrom('txs')
			.select((eb) => eb.fn.count('hash').as('cnt'))
			.where('to', '=', address)
			.executeTakeFirst(),
	])

	return {
		sent: Number(txSentResult?.cnt ?? 0),
		received: Number(txReceivedResult?.cnt ?? 0),
	}
}

export async function fetchAddressTransferActivity(
	address: Address.Address,
	chainId: number,
): Promise<{
	incoming: Array<{
		tokens: string | number
		address: string
		block_timestamp: string | number
	}>
	outgoing: Array<{
		tokens: string | number
		address: string
		block_timestamp: string | number
	}>
}> {
	const qb = QB(chainId).withSignatures([TRANSFER_SIGNATURE])

	const [incoming, outgoing] = await Promise.all([
		qb
			.selectFrom('transfer')
			.select(['tokens', 'address', 'block_timestamp'])
			.where('to', '=', address)
			.orderBy('block_timestamp', 'desc')
			.execute(),
		qb
			.selectFrom('transfer')
			.select(['tokens', 'address', 'block_timestamp'])
			.where('from', '=', address)
			.orderBy('block_timestamp', 'desc')
			.execute(),
	])

	return {
		incoming: incoming.map((row) => ({
			...row,
			tokens: row.tokens as unknown as string | number,
		})),
		outgoing: outgoing.map((row) => ({
			...row,
			tokens: row.tokens as unknown as string | number,
		})),
	}
}

export type { SortDirection }

/**
 * Fetches OG metadata for an address: tx count (including contract creation)
 * and the contract creation timestamp from the receipts table.
 */
export async function fetchAddressOgMeta(
	address: Address.Address,
	chainId: number,
): Promise<{
	txCount: number
	createdTimestamp: number | undefined
	lastActivityTimestamp: number | undefined
	accountType: 'contract' | 'account' | undefined
}> {
	const aggregate = await fetchAddressTxAggregate(address, chainId)
	let txCount = aggregate.count ?? 0
	const lastActivityTimestamp = parseTimestamp(
		aggregate.latestTxsBlockTimestamp,
	)
	let createdTimestamp = parseTimestamp(aggregate.oldestTxsBlockTimestamp)

	// Check receipts for contract creation (deployments have to=null,
	// so they won't appear in the from/to aggregate)
	type CreationRow = {
		block_timestamp: string | number | bigint | null
	}
	const creation = (await QB(chainId)
		.selectFrom('receipts')
		.select(['block_timestamp'])
		.where('contract_address', '=', address)
		.limit(1)
		.executeTakeFirst()) as CreationRow | undefined

	if (creation) {
		txCount += 1
		const ts = parseTimestamp(creation.block_timestamp)
		if (ts && (!createdTimestamp || ts < createdTimestamp)) {
			createdTimestamp = ts
		}
	}

	// Derive accountType from TIDX data when bytecode check is unavailable
	const accountType = creation
		? ('contract' as const)
		: txCount > 0
			? ('account' as const)
			: undefined

	return { txCount, createdTimestamp, lastActivityTimestamp, accountType }
}
