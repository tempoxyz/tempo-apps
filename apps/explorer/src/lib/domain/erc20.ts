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

export const erc20Bytes32MetadataAbi = [
	{
		type: 'function',
		name: 'name',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ type: 'bytes32' }],
	},
	{
		type: 'function',
		name: 'symbol',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ type: 'bytes32' }],
	},
] as const

export const erc165Abi = [
	{
		type: 'function',
		name: 'supportsInterface',
		stateMutability: 'view',
		inputs: [{ type: 'bytes4' }],
		outputs: [{ type: 'bool' }],
	},
] as const

/** ERC-165 interface IDs of the NFT standards an ERC-20 must not claim. */
export const ERC20_PROBE_INTERFACES = {
	erc721: '0x80ac58cd',
	erc1155: '0xd9b67a26',
} as const

/** Text of a bytes32 name or symbol, without trailing NUL padding. */
export function bytes32ToText(value: `0x${string}` | undefined) {
	if (!value || value.length !== 66) return undefined
	let text = ''
	for (let index = 2; index < 66; index += 2) {
		const code = Number.parseInt(value.slice(index, index + 2), 16)
		if (code === 0) break
		if (code < 0x20 || code > 0x7e) return undefined
		text += String.fromCharCode(code)
	}
	return text || undefined
}

export type Erc20ProbeResults = {
	decimals: number | undefined
	totalSupply: bigint | undefined
	balanceOf: bigint | undefined
	allowance: bigint | undefined
	name: string | undefined
	symbol: string | undefined
	nameBytes32: `0x${string}` | undefined
	symbolBytes32: `0x${string}` | undefined
	isErc721: boolean | undefined
	isErc1155: boolean | undefined
}

/**
 * Token metadata when the probe looks like an ERC-20, otherwise undefined.
 * EIP-20 requires totalSupply, balanceOf and allowance (the views among its
 * required functions); decimals is optional in the standard but needed to
 * show amounts, and it also rules out standard NFTs. name and symbol are
 * optional, read as string or else bytes32, and fall back to the address.
 */
export function interpretErc20Probe(
	address: string,
	probe: Erc20ProbeResults,
):
	| { name: string; symbol: string; decimals: number; totalSupply: bigint }
	| undefined {
	const { decimals, totalSupply } = probe
	if (decimals === undefined || totalSupply === undefined) return undefined
	if (probe.balanceOf === undefined || probe.allowance === undefined)
		return undefined
	if (probe.isErc721 === true || probe.isErc1155 === true) return undefined
	const name = probe.name || bytes32ToText(probe.nameBytes32)
	const symbol = probe.symbol || bytes32ToText(probe.symbolBytes32)
	const short = `${address.slice(0, 6)}…${address.slice(-4)}`
	return {
		name: name ?? symbol ?? short,
		symbol: symbol ?? '',
		decimals,
		totalSupply,
	}
}
