import type { Address, Hex } from 'ox'
import { tempoQueryBuilder, tidx } from '#lib/server/tempo-queries-provider'
import { parseTimestamp } from '#lib/timestamp'

const QB = tempoQueryBuilder

const TRANSFER_TOPIC0 =
	'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex.Hex

type SortDirection = 'asc' | 'desc'

function indexedAddress(address: Address.Address): Address.Address {
	return address.toLowerCase() as Address.Address
}

export async function fetchVirtualAddressTransferStats(
	address: Address.Address,
	chainId: number,
): Promise<{
	count: number
	oldestTimestamp?: unknown
	latestTimestamp?: unknown
}> {
	const topicAddress =
		`0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}` as Hex.Hex

	const result = await QB(chainId)
		.selectFrom('logs')
		.select((eb) => [
			eb.fn.count('tx_hash').distinct().as('count'),
			eb.fn.min('block_timestamp').as('oldestTimestamp'),
			eb.fn.max('block_timestamp').as('latestTimestamp'),
		])
		.where('topic0', '=', TRANSFER_TOPIC0)
		.where((eb) =>
			eb.or([eb('topic1', '=', topicAddress), eb('topic2', '=', topicAddress)]),
		)
		.executeTakeFirst()

	return {
		count: Number(result?.count ?? 0),
		oldestTimestamp: result?.oldestTimestamp,
		latestTimestamp: result?.latestTimestamp,
	}
}

/** First/last `Transfer` timestamps for a token, in one raw-logs aggregate. */
export async function fetchTokenTransferBoundaries(
	address: Address.Address,
	chainId: number,
): Promise<{
	oldestTimestamp?: unknown
	latestTimestamp?: unknown
}> {
	const tokenAddress = indexedAddress(address)
	// Raw logs instead of the Transfer CTE: production tidx errors on
	// aggregate queries over event CTEs, while this aggregate is fast.
	const result = await QB(chainId)
		.selectFrom('logs')
		.select((eb) => [
			eb.fn.min('block_timestamp').as('oldestTimestamp'),
			eb.fn.max('block_timestamp').as('latestTimestamp'),
		])
		.where('address', '=', tokenAddress)
		.where('topic0', '=', TRANSFER_TOPIC0)
		.executeTakeFirst()

	return {
		oldestTimestamp: result?.oldestTimestamp,
		latestTimestamp: result?.latestTimestamp,
	}
}

/**
 * Header stats for an EOA/contract in one aggregate: exact distinct tx count
 * (sender or recipient — self-sends counted once) plus first/last activity.
 */
export async function fetchAddressTxStats(
	address: Address.Address,
	chainId: number,
): Promise<{
	count: number
	oldestTimestamp?: unknown
	latestTimestamp?: unknown
}> {
	const accountAddress = indexedAddress(address)
	const result = await QB(chainId)
		.selectFrom('txs')
		.select((eb) => [
			eb.fn.count('hash').distinct().as('count'),
			eb.fn.min('block_timestamp').as('oldestTimestamp'),
			eb.fn.max('block_timestamp').as('latestTimestamp'),
		])
		.where((eb) =>
			eb.or([eb('from', '=', accountAddress), eb('to', '=', accountAddress)]),
		)
		.executeTakeFirst()

	return {
		count: Number(result?.count ?? 0),
		oldestTimestamp: result?.oldestTimestamp,
		latestTimestamp: result?.latestTimestamp,
	}
}

/**
 * The address's first transaction (hash + sender for the "created by" stat).
 * Two single-row reads merged here — tidx rejects `OR` filters combined with
 * `ORDER BY`/`LIMIT` in one query.
 */
export async function fetchAddressOldestTx(
	address: Address.Address,
	chainId: number,
): Promise<
	{ hash: Hex.Hex; from: string; block_timestamp: unknown } | undefined
> {
	const accountAddress = indexedAddress(address)

	const oldestBy = (field: 'from' | 'to') =>
		QB(chainId)
			.selectFrom('txs')
			.select(['hash', 'from', 'block_timestamp'])
			.where(field, '=', accountAddress)
			.orderBy('block_timestamp', 'asc')
			.orderBy('hash', 'asc')
			.limit(1)
			.executeTakeFirst() as Promise<
			{ hash: Hex.Hex; from: string; block_timestamp: unknown } | undefined
		>

	const [sent, received] = await Promise.all([oldestBy('from'), oldestBy('to')])
	if (!sent || !received) return sent ?? received
	const sentAt = parseTimestamp(sent.block_timestamp) ?? Number.MAX_VALUE
	const receivedAt =
		parseTimestamp(received.block_timestamp) ?? Number.MAX_VALUE
	return sentAt <= receivedAt ? sent : received
}

export type ContractCreationReceiptRow = {
	tx_hash: Hex.Hex
	from: string
	block_timestamp: string | number | bigint | null
}

export async function fetchContractCreationReceipt(
	address: Address.Address,
	chainId: number,
): Promise<ContractCreationReceiptRow | undefined> {
	const contractAddress = indexedAddress(address)
	return (await QB(chainId)
		.selectFrom('receipts')
		.select(['tx_hash', 'from', 'block_timestamp'])
		.where('contract_address', '=', contractAddress)
		.orderBy('block_num', 'asc')
		.limit(1)
		.executeTakeFirst()) as ContractCreationReceiptRow | undefined
}

export type AddressTxExportRow = {
	hash: Hex.Hex
	from: string
	to: string | null
	value: unknown
	block_num: unknown
	block_timestamp: unknown
	status: number | null
	gas_used: unknown
	effective_gas_price: unknown
}

/**
 * Bulk transaction rows (with receipt status/gas joined) for the CSV export,
 * in one round-trip. Sent/received ride separate `UNION ALL` branches because
 * tidx rejects `OR` filters combined with `ORDER BY`/`LIMIT`; `DISTINCT`
 * collapses self-sends that match both branches.
 */
export async function fetchAddressTxExportRows(params: {
	address: Address.Address
	chainId: number
	includeSent: boolean
	includeReceived: boolean
	status?: 'success' | 'reverted' | undefined
	after?: number | undefined
	sortDirection: SortDirection
	limit: number
}): Promise<AddressTxExportRow[]> {
	const address = indexedAddress(params.address)
	const direction = params.sortDirection === 'asc' ? 'ASC' : 'DESC'
	const limit = Math.floor(params.limit)

	const conditions: string[] = []
	if (params.status !== undefined)
		conditions.push(`r.status = ${params.status === 'reverted' ? 0 : 1}`)
	if (params.after !== undefined)
		conditions.push(
			`t.block_timestamp >= '${new Date(params.after * 1000).toISOString()}'`,
		)
	const extra = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : ''

	const select = `SELECT t.hash, t."from", t."to", t.value, t.block_num, t.block_timestamp, r.status, r.gas_used, r.effective_gas_price
		FROM txs t LEFT JOIN receipts r ON r.tx_hash = t.hash`
	const branch = (field: 'from' | 'to') =>
		`(${select} WHERE t."${field}" = '${address}'${extra} ORDER BY t.block_num ${direction} LIMIT ${limit})`

	const branches: string[] = []
	if (params.includeSent) branches.push(branch('from'))
	if (params.includeReceived) branches.push(branch('to'))
	if (branches.length === 0) return []

	const query =
		branches.length === 1
			? branches[0].slice(1, -1)
			: `SELECT DISTINCT * FROM (${branches.join(' UNION ALL ')}) combined
				ORDER BY block_num ${direction} LIMIT ${limit}`

	const result = await tidx.fetch({ chainId: params.chainId, query })
	return result.rows as unknown as AddressTxExportRow[]
}

export type { SortDirection }
