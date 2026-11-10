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

export async function fetchErc20TransfersFromLogs(params: {
	chainId: number
	token: Address.Address
	page: number
	limit: number
	account?: Address.Address | undefined
}) {
	const { chainId, token, page, limit, account } = params
	let query = transferLogs(chainId, token)
	if (account) {
		const topic =
			`0x${'0'.repeat(24)}${account.slice(2).toLowerCase()}` as Hex.Hex
		query = query.where((eb) =>
			eb.or([eb('topic1', '=', topic), eb('topic2', '=', topic)]),
		)
	}
	// One extra row tells whether another page follows.
	const rows = (await query
		.orderBy('block_num', 'desc')
		.orderBy('log_idx', 'desc')
		.limit(limit + 1)
		.offset((page - 1) * limit)
		.execute()) as TransferLog[]

	return {
		exhausted: rows.length <= limit,
		transfers: rows.slice(0, limit).map((log) => ({
			id: `${log.tx_hash}-${log.log_idx}`,
			from: topicToAddress(log.topic1),
			to: topicToAddress(log.topic2),
			value: dataToValue(log.data).toString(),
			transactionHash: log.tx_hash as Hex.Hex,
			blockNumber: String(log.block_num),
			timestamp: toIsoTimestamp(log.block_timestamp),
		})),
	}
}

export async function fetchErc20HoldersFromLogs(params: {
	chainId: number
	token: Address.Address
	page: number
	limit: number
}) {
	const { chainId, token, page, limit } = params
	const rows = (await transferLogs(chainId, token)
		.orderBy('block_num', 'asc')
		.orderBy('log_idx', 'asc')
		.limit(ERC20_HOLDER_SCAN_LIMIT)
		.execute()) as TransferLog[]

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

	return {
		holders: holders
			.slice((page - 1) * limit, page * limit)
			.map(([address, balance]) => ({ address, balance: balance.toString() })),
		total: holders.length,
		// A full scan window means older history (and holders) were cut off.
		totalCapped: rows.length === ERC20_HOLDER_SCAN_LIMIT,
		totalBalance: totalBalance.toString(),
	}
}
