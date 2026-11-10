import type { Address, Hex } from 'ox'

/**
 * Pure decoding and balance replay for plain ERC-20 `Transfer` logs, which
 * the explorer reads raw because the Tempo API only indexes TIP-20 tokens.
 */

/** keccak256("Transfer(address,address,uint256)"), shared by ERC-20 and TIP-20. */
export const TRANSFER_TOPIC0 =
	'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex.Hex

export const ZERO_ADDRESS =
	'0x0000000000000000000000000000000000000000' as const

export type TransferLog = {
	topic1: string | null
	topic2: string | null
	data: string | null
	block_num: number | string | bigint
	block_timestamp: unknown
	tx_hash: string
	log_idx: number | string | bigint
}

export function topicToAddress(topic: string | null): Address.Address {
	if (!topic) return ZERO_ADDRESS
	return `0x${topic.slice(-40)}`.toLowerCase() as Address.Address
}

/** The 32-byte amount at the start of the log data. */
export function dataToValue(data: string | null): bigint {
	if (!data || data === '0x') return 0n
	return BigInt(data.slice(0, 66))
}

export function toIsoTimestamp(value: unknown): string | null {
	if (value == null) return null
	if (typeof value === 'number' || typeof value === 'bigint')
		return new Date(Number(value) * 1000).toISOString()
	const date = new Date(String(value))
	return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

export function toTransfer(log: TransferLog) {
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

/** Newest first: by block, then by log index. */
export function compareLogsDesc(a: TransferLog, b: TransferLog): number {
	const block = BigInt(b.block_num) - BigInt(a.block_num)
	if (block !== 0n) return block > 0n ? 1 : -1
	const index = BigInt(b.log_idx) - BigInt(a.log_idx)
	return index === 0n ? 0 : index > 0n ? 1 : -1
}

/** Net balance per address from logs in chain order, excluding 0x0. */
export function replayBalances(
	logs: ReadonlyArray<Pick<TransferLog, 'topic1' | 'topic2' | 'data'>>,
): Map<Address.Address, bigint> {
	const balances = new Map<Address.Address, bigint>()
	for (const log of logs) {
		const value = dataToValue(log.data)
		const from = topicToAddress(log.topic1)
		const to = topicToAddress(log.topic2)
		balances.set(from, (balances.get(from) ?? 0n) - value)
		balances.set(to, (balances.get(to) ?? 0n) + value)
	}
	balances.delete(ZERO_ADDRESS)
	return balances
}

/**
 * Holders sorted by balance, largest first, when the replayed balances
 * reconcile with the chain: none negative, and their sum equal to
 * `supplyOutsideZero` (totalSupply minus balanceOf(0x0)). A token that mints,
 * burns or rebases without emitting Transfer fails this and returns undefined.
 */
export function reconcileHolders(
	balances: ReadonlyMap<Address.Address, bigint>,
	supplyOutsideZero: bigint,
):
	| { holders: Array<[Address.Address, bigint]>; totalBalance: bigint }
	| undefined {
	let totalBalance = 0n
	for (const balance of balances.values()) {
		if (balance < 0n) return undefined
		totalBalance += balance
	}
	if (totalBalance !== supplyOutsideZero) return undefined
	const holders = [...balances]
		.filter(([, balance]) => balance > 0n)
		.sort(([, a], [, b]) => (a === b ? 0 : a > b ? -1 : 1))
	return { holders, totalBalance }
}
