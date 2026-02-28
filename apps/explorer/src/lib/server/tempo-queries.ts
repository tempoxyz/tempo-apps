import type { Address, Hex } from 'ox'
import * as OxHash from 'ox/Hash'
import * as OxHex from 'ox/Hex'
import { decodeAbiParameters, zeroAddress } from 'viem'
import * as ABIS from '#lib/abis'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'

const QB = tempoQueryBuilder

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

type SortDirection = 'asc' | 'desc'

type QueryWithWhere<TQuery> = TQuery & {
	where: (...args: unknown[]) => TQuery
}

export type TokenHolderBalance = { address: string; balance: bigint }

export async function fetchTokenHolderBalances(
	address: Address.Address,
	chainId: number,
): Promise<TokenHolderBalance[]> {
	const qb = QB(chainId).withSignatures([TRANSFER_SIGNATURE])

	const outgoing = await qb
		.selectFrom('transfer')
		.select((eb) => [
			eb.ref('from').as('holder'),
			eb.fn.sum('tokens').as('sent'),
		])
		.where('address', '=', address)
		.where('from', '<>', zeroAddress)
		.groupBy('from')
		.execute()

	const incoming = await qb
		.selectFrom('transfer')
		.select((eb) => [
			eb.ref('to').as('holder'),
			eb.fn.sum('tokens').as('received'),
		])
		.where('address', '=', address)
		.groupBy('to')
		.execute()

	const balances = new Map<string, bigint>()

	for (const row of incoming) {
		const holder = row.holder
		const received = BigInt(row.received)
		balances.set(holder, (balances.get(holder) ?? 0n) + received)
	}

	for (const row of outgoing) {
		const holder = row.holder
		const sent = BigInt(row.sent)
		balances.set(holder, (balances.get(holder) ?? 0n) - sent)
	}

	return Array.from(balances.entries())
		.filter(([, balance]) => balance > 0n)
		.map(([holder, balance]) => ({ address: holder, balance }))
		.sort((a, b) => (b.balance > a.balance ? 1 : -1))
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
	Array<{ token: string; name: string; symbol: string; currency: string }>
> {
	if (tokens.length === 0) return []

	const tokenCreatedSignature = ABIS.getTokenCreatedEvent(chainId)
	const topic0 = OxHash.keccak256(
		OxHex.fromString(tokenCreatedSignature.replace(/^event /, '')),
	)

	const tokenTopics = tokens.map(
		(t) =>
			`0x${t.toLowerCase().replace(/^0x/, '').padStart(64, '0')}` as Hex.Hex,
	)

	const rows = await QB(chainId)
		.selectFrom('logs')
		.select(['topic1', 'data'])
		.where('topic0', '=', topic0)
		.where('topic1', 'in', tokenTopics)
		.execute()

	const isAndantino = chainId === 42429
	const dataParams = isAndantino
		? ([
				{ name: 'name', type: 'string' },
				{ name: 'symbol', type: 'string' },
				{ name: 'currency', type: 'string' },
				{ name: 'quoteToken', type: 'address' },
				{ name: 'admin', type: 'address' },
			] as const)
		: ([
				{ name: 'name', type: 'string' },
				{ name: 'symbol', type: 'string' },
				{ name: 'currency', type: 'string' },
				{ name: 'quoteToken', type: 'address' },
				{ name: 'admin', type: 'address' },
				{ name: 'salt', type: 'bytes32' },
			] as const)

	const results: Array<{
		token: string
		name: string
		symbol: string
		currency: string
	}> = []

	for (const row of rows) {
		if (!row.topic1 || !row.data) continue
		try {
			const token = `0x${(row.topic1 as string).slice(-40)}` as string
			const decoded = decodeAbiParameters(dataParams, row.data as Hex.Hex)
			results.push({
				token,
				name: decoded[0] as string,
				symbol: decoded[1] as string,
				currency: decoded[2] as string,
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
	},
): Promise<DirectTxHistoryRow[]> {
	let directQuery = QB(params.chainId)
		.selectFrom('txs')
		.select(['hash', 'block_num', 'from', 'to', 'value'])

	directQuery = applyAddressDirectionFilter(directQuery, params)

	return directQuery
		.orderBy('block_num', params.sortDirection)
		.orderBy('hash', params.sortDirection)
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
	params: AddressDirectionParams & { countCap: number },
): Promise<number> {
	const qb = QB(params.chainId)
	let subquery = qb.selectFrom('txs').select((eb) => eb.lit(1).as('x'))

	subquery = applyAddressDirectionFilter(subquery, params)

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
	const qb = QB(chainId)
	const result = await qb
		.selectFrom('txs')
		.where((wb) => wb.or([wb('from', '=', address), wb('to', '=', address)]))
		.select((sb) => [
			sb.fn.count('hash').as('count'),
			sb.fn.max('block_timestamp').as('latestTxsBlockTimestamp'),
			sb.fn.min('block_timestamp').as('oldestTxsBlockTimestamp'),
		])
		.executeTakeFirst()

	// Fetch the hash of the oldest transaction separately
	const oldest = await qb
		.selectFrom('txs')
		.where((wb) => wb.or([wb('from', '=', address), wb('to', '=', address)]))
		.select((eb) => [eb.ref('hash').as('hash'), eb.ref('from').as('sender')])
		.orderBy('block_timestamp', 'asc')
		.limit(1)
		.executeTakeFirst()

	return {
		count: result?.count ? Number(result.count) : undefined,
		latestTxsBlockTimestamp: result?.latestTxsBlockTimestamp,
		oldestTxsBlockTimestamp: result?.oldestTxsBlockTimestamp,
		oldestTxHash: oldest?.hash as string | undefined,
		oldestTxFrom: oldest?.sender as string | undefined,
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
