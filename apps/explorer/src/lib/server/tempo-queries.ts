import { sql } from 'idxs'
import type { Address, Hex } from 'ox'
import { zeroAddress } from 'viem'
import * as ABIS from '#lib/abis'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'

const QB = tempoQueryBuilder

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'
const TRANSFER_AMOUNT_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 amount)'

type SortDirection = 'asc' | 'desc'

type QueryWithWhere<TQuery> = TQuery & {
	where: (...args: unknown[]) => TQuery
}

export type TokenHolderBalance = { address: string; balance: bigint }

export async function fetchTokenHolderBalances(
	address: Address.Address,
	chainId: number,
): Promise<TokenHolderBalance[]> {
	const qb = QB.withSignatures([TRANSFER_SIGNATURE])

	const outgoing = await qb
		.selectFrom('transfer')
		.select((eb) => [
			eb.ref('from').as('holder'),
			eb.fn.sum('tokens').as('sent'),
		])
		.where('chain', '=', chainId)
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
		.where('chain', '=', chainId)
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
	const qb = QB.withSignatures([TRANSFER_SIGNATURE])

	const firstTransfer = await qb
		.selectFrom('transfer')
		.select(['block_timestamp'])
		.where('chain', '=', chainId)
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
	let query = QB.withSignatures([TRANSFER_SIGNATURE])
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
		.where('chain', '=', chainId)
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
	let subquery = QB.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select((eb) => eb.lit(1).as('x'))
		.where('chain', '=', chainId)
		.where('address', '=', address)

	if (account) {
		subquery = subquery.where((eb) =>
			eb.or([eb('from', '=', account), eb('to', '=', account)]),
		)
	}

	const result = await QB.selectFrom(subquery.limit(countCap).as('subquery'))
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

	return QB.withSignatures([eventSignature])
		.selectFrom('tokencreated')
		.select(['token', 'symbol', 'name', 'currency', 'block_timestamp'])
		.where('chain', '=', chainId as never)
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

	const result = await QB.selectFrom(
		QB.withSignatures([eventSignature])
			.selectFrom('tokencreated')
			.select((eb) => eb.lit(1).as('x'))
			.where('chain', '=', chainId as never)
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

	const tokenCreatedSignature =
		chainId === 42429
			? ABIS.TOKEN_CREATED_EVENT_ANDANTINO
			: ABIS.TOKEN_CREATED_EVENT

	return QB.withSignatures([tokenCreatedSignature])
		.selectFrom('tokencreated')
		.select(['token', 'name', 'symbol', 'currency'])
		.where('chain', '=', chainId)
		.where('token', 'in', tokens)
		.execute()
}

export async function fetchTransactionTimestamp(
	chainId: number,
	hash: Hex.Hex,
): Promise<number | undefined> {
	const result = await QB.selectFrom('txs')
		.select(['block_timestamp'])
		.where('chain', '=', chainId)
		.where('hash', '=', hash)
		.limit(1)
		.executeTakeFirst()

	return result?.block_timestamp ? Number(result.block_timestamp) : undefined
}

export async function fetchLatestBlockNumber(chainId: number): Promise<bigint> {
	const result = await QB.selectFrom('blocks')
		.select('num')
		.where('chain', '=', chainId)
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

function applyAddressDirectionFilter<TQuery>(
	query: QueryWithWhere<TQuery>,
	params: AddressDirectionParams,
): TQuery {
	const { address, includeSent, includeReceived } = params
	if (includeSent && includeReceived) {
		return query.where((eb: any) =>
			eb.or([eb('from', '=', address), eb('to', '=', address)]),
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
	let directQuery = QB.selectFrom('txs')
		.select(['hash', 'block_num'])
		.where('chain', '=', params.chainId)

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
	let directQuery = QB.selectFrom('txs')
		.select(['hash', 'block_num', 'from', 'to', 'value'])
		.where('chain', '=', params.chainId)

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
	let transferQuery = QB.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select(['tx_hash', 'block_num'])
		.distinct()
		.where('chain', '=', params.chainId)

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
	return QB.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select(['tx_hash', 'block_num'])
		.distinct()
		.where('chain', '=', params.chainId)
		.where('address', '=', params.address)
		.orderBy('block_num', params.sortDirection)
		.orderBy('tx_hash', params.sortDirection)
		.limit(params.limit)
		.execute()
}

export type DirectTxCountRow = { hash: Hex.Hex }

export async function fetchAddressDirectTxCountRows(
	params: AddressDirectionParams & { limit: number },
): Promise<DirectTxCountRow[]> {
	let countQuery = QB.selectFrom('txs')
		.select((eb) => eb.ref('hash').as('hash'))
		.where('chain', '=', params.chainId)

	countQuery = applyAddressDirectionFilter(countQuery, params)

	return countQuery.limit(params.limit).execute()
}

export type TransferCountRow = { hash: Hex.Hex }

export async function fetchAddressTransferCountRows(
	params: AddressDirectionParams & { limit: number },
): Promise<TransferCountRow[]> {
	let countQuery = QB.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select((eb) => eb.ref('tx_hash').as('hash'))
		.distinct()
		.where('chain', '=', params.chainId)

	countQuery = applyAddressDirectionFilter(countQuery, params)

	return countQuery.limit(params.limit).execute()
}

export async function fetchAddressTransferEmittedCountRows(params: {
	address: Address.Address
	chainId: number
	limit: number
}): Promise<TransferCountRow[]> {
	return QB.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select((eb) => eb.ref('tx_hash').as('hash'))
		.distinct()
		.where('chain', '=', params.chainId)
		.where('address', '=', params.address)
		.limit(params.limit)
		.execute()
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

	const result = await QB.selectFrom('txs')
		.select([
			'hash',
			'block_num',
			'from',
			'to',
			'value',
			'input',
			'nonce',
			'gas',
			'gas_price',
			'type',
		])
		.where('chain', '=', chainId)
		.where('hash', 'in', hashes)
		.execute()

	return result.map((row) => ({
		...row,
		type: BigInt(row.type),
	}))
}

export type BasicTxRow = {
	hash: Hex.Hex
	from: string
	to: string | null
	value: bigint
}

export async function fetchBasicTxDataByHashes(
	chainId: number,
	hashes: Hex.Hex[],
): Promise<BasicTxRow[]> {
	if (hashes.length === 0) return []

	return QB.selectFrom('txs')
		.select(['hash', 'from', 'to', 'value'])
		.where('chain', '=', chainId)
		.where('hash', 'in', hashes)
		.execute()
}

export async function fetchContractCreationTxCandidates(
	chainId: number,
	creationBlock: bigint,
): Promise<Array<{ hash: Hex.Hex; block_num: bigint }>> {
	return QB.selectFrom('txs')
		.select(['hash', 'block_num'])
		.where('chain', '=', chainId)
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
	const [amountResults, tokensResults] = await Promise.all([
		QB.withSignatures([TRANSFER_AMOUNT_SIGNATURE])
			.selectFrom('transfer')
			.select((eb) => [
				eb.ref('address').as('token'),
				sql<string>`SUM(CASE WHEN "to" = ${address} THEN amount ELSE 0 END)`.as(
					'received',
				),
				sql<string>`SUM(CASE WHEN "from" = ${address} THEN amount ELSE 0 END)`.as(
					'sent',
				),
			])
			.where('chain', '=', chainId)
			.where((eb) => eb.or([eb('from', '=', address), eb('to', '=', address)]))
			.groupBy('address')
			.execute()
			.catch(() => []),
		QB.withSignatures([TRANSFER_SIGNATURE])
			.selectFrom('transfer')
			.select((eb) => [
				eb.ref('address').as('token'),
				sql<string>`SUM(CASE WHEN "to" = ${address} THEN tokens ELSE 0 END)`.as(
					'received',
				),
				sql<string>`SUM(CASE WHEN "from" = ${address} THEN tokens ELSE 0 END)`.as(
					'sent',
				),
			])
			.where('chain', '=', chainId)
			.where((eb) => eb.or([eb('from', '=', address), eb('to', '=', address)]))
			.groupBy('address')
			.execute()
			.catch(() => []),
	])

	const merged = new Map<
		string,
		{ token: string; received: bigint; sent: bigint }
	>()
	for (const row of [...amountResults, ...tokensResults]) {
		const token = String(row.token).toLowerCase()
		const existing = merged.get(token)
		if (existing) {
			existing.received += BigInt(row.received ?? 0)
			existing.sent += BigInt(row.sent ?? 0)
		} else {
			merged.set(token, {
				token: row.token,
				received: BigInt(row.received ?? 0),
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
	const result = await QB.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select(['address', 'from', 'to', 'tokens'])
		.where('chain', '=', chainId)
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
}> {
	const result = await QB.selectFrom('txs')
		.where('txs.chain', '=', chainId)
		.where((wb) =>
			wb.or([wb('txs.from', '=', address), wb('txs.to', '=', address)]),
		)
		.select((sb) => [
			sb.fn.count('txs.hash').as('count'),
			sb.fn.max('txs.block_timestamp').as('latestTxsBlockTimestamp'),
			sb.fn.min('txs.block_timestamp').as('oldestTxsBlockTimestamp'),
		])
		.executeTakeFirst()

	return {
		count: result?.count ? Number(result.count) : undefined,
		latestTxsBlockTimestamp: result?.latestTxsBlockTimestamp,
		oldestTxsBlockTimestamp: result?.oldestTxsBlockTimestamp,
	}
}

export async function fetchAddressTxCounts(
	address: Address.Address,
	chainId: number,
): Promise<{ sent: number; received: number }> {
	const [txSentResult, txReceivedResult] = await Promise.all([
		QB.selectFrom('txs')
			.select((eb) => eb.fn.count('hash').as('cnt'))
			.where('from', '=', address)
			.where('chain', '=', chainId)
			.executeTakeFirst(),
		QB.selectFrom('txs')
			.select((eb) => eb.fn.count('hash').as('cnt'))
			.where('to', '=', address)
			.where('chain', '=', chainId)
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
	const qb = QB.withSignatures([TRANSFER_SIGNATURE])

	const [incoming, outgoing] = await Promise.all([
		qb
			.selectFrom('transfer')
			.select(['tokens', 'address', 'block_timestamp'])
			.where('chain', '=', chainId)
			.where('to', '=', address)
			.orderBy('block_timestamp', 'desc')
			.execute(),
		qb
			.selectFrom('transfer')
			.select(['tokens', 'address', 'block_timestamp'])
			.where('chain', '=', chainId)
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
