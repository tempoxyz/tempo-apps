import type { Address, Hex } from 'ox'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'

/**
 * Raw-log readers for plain ERC-20 contracts. The Tempo API only indexes
 * TIP-20 tokens, so a non-TIP-20 token's transfers and holders come straight
 * from its `Transfer` logs.
 */

const TRANSFER_TOPIC0 =
	'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex.Hex

/** Most `Transfer` logs the holders view replays to rebuild balances. */
export const ERC20_HOLDER_SCAN_LIMIT = 10_000

/**
 * Deepest row an account-filtered transfers view pages to. Each page reads
 * both sides up to its end, so this bounds a request to about twice as many
 * logs.
 */
export const ERC20_FILTERED_TRANSFER_DEPTH = 1_000

type TransferLog = {
	topic1: string | null
	topic2: string | null
	data: string | null
	block_num: number | string | bigint
	block_timestamp: unknown
	tx_hash: string
	log_idx: number | string | bigint
}

function topicToAddress(topic: string | null): Address.Address {
	if (!topic) return '0x0000000000000000000000000000000000000000'
	return `0x${topic.slice(-40)}`.toLowerCase() as Address.Address
}

function dataToValue(data: string | null): bigint {
	if (!data || data === '0x') return 0n
	return BigInt(data.slice(0, 66))
}

function toIsoTimestamp(value: unknown): string | null {
	if (value == null) return null
	if (typeof value === 'number' || typeof value === 'bigint')
		return new Date(Number(value) * 1000).toISOString()
	const date = new Date(String(value))
	return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function transferLogs(chainId: number, token: Address.Address) {
	return tempoQueryBuilder(chainId)
		.selectFrom('logs')
		.select([
			'topic1',
			'topic2',
			'data',
			'block_num',
			'block_timestamp',
			'tx_hash',
			'log_idx',
		])
		.where('address', '=', token.toLowerCase() as Address.Address)
		.where('topic0', '=', TRANSFER_TOPIC0)
}

function toTransfer(log: TransferLog) {
	return {
		id: `${log.tx_hash}-${log.log_idx}`,
		from: topicToAddress(log.topic1),
		to: topicToAddress(log.topic2),
		value: dataToValue(log.data).toString(),
		transactionHash: log.tx_hash as Hex.Hex,
		blockNumber: String(log.block_num),
		timestamp: toIsoTimestamp(log.block_timestamp),
	}
}

function compareLogsDesc(a: TransferLog, b: TransferLog): number {
	const block = BigInt(b.block_num) - BigInt(a.block_num)
	if (block !== 0n) return block > 0n ? 1 : -1
	const index = BigInt(b.log_idx) - BigInt(a.log_idx)
	return index === 0n ? 0 : index > 0n ? 1 : -1
}

export async function fetchErc20TransfersFromLogs(params: {
	chainId: number
	token: Address.Address
	page: number
	limit: number
	account?: Address.Address | undefined
}) {
	const { chainId, token, page, limit, account } = params
	const offset = (page - 1) * limit

	let rows: TransferLog[]
	let reachedDepth = false
	if (account) {
		if (offset >= ERC20_FILTERED_TRANSFER_DEPTH)
			return { exhausted: true, transfers: [] }
		const end = Math.min(offset + limit, ERC20_FILTERED_TRANSFER_DEPTH)
		reachedDepth = end === ERC20_FILTERED_TRANSFER_DEPTH
		// tidx rejects OR filters combined with ORDER BY/LIMIT, so read the
		// sender and recipient sides separately (each up to the end of this
		// page plus one row), then merge, de-duplicate self-transfers and slice.
		const topic =
			`0x${'0'.repeat(24)}${account.slice(2).toLowerCase()}` as Hex.Hex
		const side = (column: 'topic1' | 'topic2') =>
			transferLogs(chainId, token)
				.where(column, '=', topic)
				.orderBy('block_num', 'desc')
				.orderBy('log_idx', 'desc')
				.limit(end + 1)
				.execute() as Promise<TransferLog[]>
		const [sent, received] = await Promise.all([side('topic1'), side('topic2')])
		const merged = new Map<string, TransferLog>()
		for (const log of [...sent, ...received])
			merged.set(`${log.tx_hash}-${log.log_idx}`, log)
		rows = [...merged.values()].sort(compareLogsDesc).slice(offset, end + 1)
	} else {
		// One extra row tells whether another page follows.
		rows = (await transferLogs(chainId, token)
			.orderBy('block_num', 'desc')
			.orderBy('log_idx', 'desc')
			.limit(limit + 1)
			.offset(offset)
			.execute()) as TransferLog[]
	}

	return {
		// Pagination stops at the filtered depth cap.
		exhausted: reachedDepth || rows.length <= limit,
		transfers: rows
			.slice(0, reachedDepth ? ERC20_FILTERED_TRANSFER_DEPTH - offset : limit)
			.map(toTransfer),
	}
}

type Erc20Holders =
	| {
			unavailable: false
			holders: Array<[Address.Address, bigint]>
			totalBalance: bigint
	  }
	// The history is too long to replay, so current balances are unknown.
	| { unavailable: true }

const HOLDERS_CACHE_TTL = 60_000
const HOLDERS_CACHE_MAX_ENTRIES = 20
const holdersCache = new Map<
	string,
	{ promise: Promise<Erc20Holders>; timestamp: number }
>()

/**
 * Current balances replayed from every Transfer log of the token. A bounded
 * history cannot establish current balances once it fills up, so tokens past
 * the scan limit report holders as unavailable instead of showing stale ones.
 * That outcome is cached like any other, so large tokens aren't rescanned.
 */
async function loadErc20Holders(
	chainId: number,
	token: Address.Address,
): Promise<Erc20Holders> {
	const rows = (await transferLogs(chainId, token)
		.orderBy('block_num', 'asc')
		.orderBy('log_idx', 'asc')
		.limit(ERC20_HOLDER_SCAN_LIMIT)
		.execute()) as TransferLog[]
	if (rows.length === ERC20_HOLDER_SCAN_LIMIT) return { unavailable: true }

	const balances = new Map<Address.Address, bigint>()
	for (const log of rows) {
		const value = dataToValue(log.data)
		const from = topicToAddress(log.topic1)
		const to = topicToAddress(log.topic2)
		balances.set(from, (balances.get(from) ?? 0n) - value)
		balances.set(to, (balances.get(to) ?? 0n) + value)
	}
	balances.delete('0x0000000000000000000000000000000000000000')

	const holders = [...balances]
		.filter(([, balance]) => balance > 0n)
		.sort(([, a], [, b]) => (a === b ? 0 : a > b ? -1 : 1))
	const totalBalance = holders.reduce((sum, [, balance]) => sum + balance, 0n)
	return { unavailable: false, holders, totalBalance }
}

/** Cached per token (as the in-flight promise) so pages and prefetches share one scan. */
function getErc20Holders(
	chainId: number,
	token: Address.Address,
): Promise<Erc20Holders> {
	const key = `${chainId}-${token.toLowerCase()}`
	const cached = holdersCache.get(key)
	if (cached && Date.now() - cached.timestamp < HOLDERS_CACHE_TTL)
		return cached.promise
	if (
		!holdersCache.has(key) &&
		holdersCache.size >= HOLDERS_CACHE_MAX_ENTRIES
	) {
		const oldestKey = holdersCache.keys().next().value
		if (oldestKey) holdersCache.delete(oldestKey)
	}
	const promise = loadErc20Holders(chainId, token)
	holdersCache.set(key, { promise, timestamp: Date.now() })
	promise.catch(() => {
		if (holdersCache.get(key)?.promise === promise) holdersCache.delete(key)
	})
	return promise
}

export async function fetchErc20HoldersFromLogs(params: {
	chainId: number
	token: Address.Address
	page: number
	limit: number
}) {
	const { chainId, token, page, limit } = params
	const result = await getErc20Holders(chainId, token)
	if (result.unavailable)
		return {
			holders: [],
			total: 0,
			totalCapped: false,
			totalBalance: '0',
			unavailable: true,
		}
	const { holders, totalBalance } = result
	return {
		holders: holders
			.slice((page - 1) * limit, page * limit)
			.map(([address, balance]) => ({ address, balance: balance.toString() })),
		// The full history was replayed, so the count is exact.
		total: holders.length,
		totalCapped: false,
		totalBalance: totalBalance.toString(),
	}
}
