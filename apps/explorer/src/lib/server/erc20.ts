import type { Address, Hex } from 'ox'
import { erc20Abi } from 'viem'
import { readContract } from 'viem/actions'
import {
	compareLogsDesc,
	reconcileHolders,
	replayBalances,
	TRANSFER_TOPIC0,
	type TransferLog,
	toTransfer,
	ZERO_ADDRESS,
} from '#lib/domain/erc20'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import { getBatchedClient } from '#wagmi.config.ts'

/**
 * Raw-log readers for plain ERC-20 contracts. The Tempo API only indexes
 * TIP-20 tokens, so a non-TIP-20 token's transfers and holders come straight
 * from its `Transfer` logs.
 */

/** Most `Transfer` logs the holders view replays to rebuild balances. */
export const ERC20_HOLDER_SCAN_LIMIT = 10_000

/**
 * Deepest row an account-filtered transfers view pages to. Each page reads
 * both sides up to its end, so this bounds a request to about twice as many
 * logs.
 */
export const ERC20_FILTERED_TRANSFER_DEPTH = 1_000

function transferLogs(chainId: number, token: Address.Address) {
	return tempoQueryBuilder(chainId)
		.selectFrom('logs')
		.select((eb) => [
			'topic1',
			'topic2',
			// The contract chooses its log data, so read only the 32-byte amount
			// (data is stored as hex text: "0x" plus 64 hex characters).
			eb
				.fn<string>('substring', [eb.ref('data'), eb.lit(1), eb.lit(66)])
				.as('data'),
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
	const offset = (page - 1) * limit

	let rows: TransferLog[]
	let reachedDepth = false
	// More filtered transfers exist past the depth cap than this view lists.
	let truncated = false
	// Exact transfer count, when known (the unfiltered view only).
	let total: number | undefined
	if (account) {
		if (offset >= ERC20_FILTERED_TRANSFER_DEPTH)
			return { exhausted: true, truncated: true, transfers: [] }
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
		const sorted = [...merged.values()].sort(compareLogsDesc)
		truncated = reachedDepth && sorted.length > ERC20_FILTERED_TRANSFER_DEPTH
		rows = sorted.slice(offset, end + 1)
	} else {
		// One extra row tells whether another page follows; the count lets
		// every page show the exact total rather than a capped one.
		const [page, count] = await Promise.all([
			transferLogs(chainId, token)
				.orderBy('block_num', 'desc')
				.orderBy('log_idx', 'desc')
				.limit(limit + 1)
				.offset(offset)
				.execute() as Promise<TransferLog[]>,
			tempoQueryBuilder(chainId)
				.selectFrom('logs')
				.select((eb) => eb.fn.countAll().as('count'))
				.where('address', '=', token.toLowerCase() as Address.Address)
				.where('topic0', '=', TRANSFER_TOPIC0)
				.executeTakeFirst()
				.catch(() => undefined),
		])
		rows = page
		const value = Number(count?.count)
		if (Number.isSafeInteger(value) && value >= 0) total = value
	}

	return {
		total,
		// Pagination stops at the filtered depth cap.
		exhausted: reachedDepth || rows.length <= limit,
		truncated,
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

/** Holders checked one by one against balanceOf after the supply check. */
const ERC20_HOLDER_VERIFY_LIMIT = 200

/**
 * totalSupply minus the zero address's balance, at blockNumber when the RPC
 * still serves that state, otherwise at the latest block, with the block it
 * was read at (undefined for the latest).
 */
async function readSupplyOutsideZero(
	token: Address.Address,
	blockNumber: bigint | undefined,
): Promise<{ value: bigint; blockNumber: bigint | undefined } | undefined> {
	const client = getBatchedClient()
	const read = (block: bigint | undefined) =>
		Promise.all([
			readContract(client, {
				address: token,
				abi: erc20Abi,
				functionName: 'totalSupply',
				blockNumber: block,
			}),
			readContract(client, {
				address: token,
				abi: erc20Abi,
				functionName: 'balanceOf',
				args: [ZERO_ADDRESS],
				blockNumber: block,
			}),
		]).then(([supply, zeroBalance]) => ({
			value: supply - zeroBalance,
			blockNumber: block,
		}))
	return read(blockNumber)
		.catch(() => (blockNumber === undefined ? undefined : read(undefined)))
		.catch(() => undefined)
}

/**
 * Whether the largest holders' replayed balances equal balanceOf at
 * blockNumber. A token that moves balances without emitting Transfer while
 * keeping its supply passes the supply check but fails this one.
 */
async function holdersMatchChain(
	token: Address.Address,
	holders: ReadonlyArray<readonly [Address.Address, bigint]>,
	blockNumber: bigint | undefined,
): Promise<boolean> {
	const client = getBatchedClient()
	const checked = holders.slice(0, ERC20_HOLDER_VERIFY_LIMIT)
	const onChain = await Promise.all(
		checked.map(([address]) =>
			readContract(client, {
				address: token,
				abi: erc20Abi,
				functionName: 'balanceOf',
				args: [address],
				blockNumber,
			}),
		),
	).catch(() => undefined)
	return (
		onChain !== undefined &&
		checked.every(([, balance], index) => onChain[index] === balance)
	)
}

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
	// Replay up to the indexer's head and read supply at that same block:
	// later blocks may not be indexed yet, and a supply change that emits no
	// Transfer after the token's last log still fails the check below.
	const head = await tempoQueryBuilder(chainId)
		.selectFrom('blocks')
		.select('num')
		.orderBy('num', 'desc')
		.limit(1)
		.executeTakeFirst()
		.catch(() => undefined)
	const headBlock = head ? BigInt(head.num) : undefined
	let logs = transferLogs(chainId, token)
	if (headBlock !== undefined) logs = logs.where('block_num', '<=', headBlock)
	const rows = (await logs
		.orderBy('block_num', 'asc')
		.orderBy('log_idx', 'asc')
		.limit(ERC20_HOLDER_SCAN_LIMIT)
		.execute()) as TransferLog[]
	if (rows.length === ERC20_HOLDER_SCAN_LIMIT) return { unavailable: true }

	const balances = replayBalances(rows)

	// Balances replayed from Transfer logs are only trustworthy when they
	// reconcile with the chain: a token that mints, burns or rebases without
	// emitting Transfer leaves negative balances or a sum off its supply.
	// Supply counts any balance parked at the zero address (Uniswap V2's
	// locked liquidity, transfers to 0x0 that don't burn), so compare against
	// totalSupply minus balanceOf(0x0), read at the replayed head block so
	// indexer lag behind the chain head can't fail the check.
	const onChain = await readSupplyOutsideZero(
		token,
		headBlock ??
			(rows.length > 0 ? BigInt(rows[rows.length - 1].block_num) : undefined),
	)
	if (onChain === undefined) return { unavailable: true }
	const reconciled = reconcileHolders(balances, onChain.value)
	if (!reconciled) return { unavailable: true }
	if (
		!(await holdersMatchChain(token, reconciled.holders, onChain.blockNumber))
	)
		return { unavailable: true }
	return { unavailable: false, ...reconciled }
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
