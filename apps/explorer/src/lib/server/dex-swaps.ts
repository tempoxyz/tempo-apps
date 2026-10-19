import { createServerFn } from '@tanstack/react-start'
import { type Address, formatUnits, type Hex } from 'viem'
import { Addresses } from 'viem/tempo'
import * as z from 'zod/mini'
import { append, type DexPoolToken, originalQuote } from '#lib/dex-pools'
import {
	type DexFill,
	type DexOrderState,
	type DexSwap,
	type DexTransactionFills,
	fillHop,
	groupSwaps,
	orderAt,
	quoteAt,
} from '#lib/dex-swaps'
import {
	addressOf,
	indexer,
	list,
	MAX_SWITCHES,
	type Row,
	readQuoteSwitches,
	readTokens,
	readVerified,
} from '#lib/server/dex-indexer'
import { withDeadline } from '#lib/server/dex-route'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { zAddress, zHash } from '#lib/zod'
import { getBatchedClient, getTempoChain } from '#wagmi.config'

/** Fills read per page; a swap is one or more fills. */
const FILLS = 400
/** Safety bound on one block's fills; block gas keeps it far lower. */
const BLOCK_FILLS = 10_000
/** Pages scanned for enough matching swaps before giving up. */
const PAGES = 5
const SWAPS = 25

const stablecoinDex = Addresses.stablecoinDex.toLowerCase()
const orderFlipped =
	'OrderFlipped(uint128 indexed orderId, address indexed maker, address indexed token, uint128 amount, bool isBid, int16 tick, int16 flipTick)'
const hexHash = /^0x[0-9a-f]{64}$/
const fillColumns = `block_num, log_idx, tx_hash,
	toUnixTimestamp(block_timestamp) AS ts, toString("orderId") AS id, taker,
	toString("amountFilled") AS amount`
const orderId = /^\d{1,39}$/

function orderStates(rows: Row[]): [string, DexOrderState][] {
	return rows.flatMap((row) => {
		const token = addressOf(row.token)
		const id = String(row.id)
		if (!token || !orderId.test(id)) return []
		return [
			[
				id,
				{
					block: Number(row.block_num),
					log: Number(row.log_idx),
					token,
					isBid: Number(row.bid) === 1,
					tick: Number(row.tick),
				},
			],
		]
	})
}

/**
 * A page of fills before `before`, newest first. A full page ends at a block
 * boundary so one transaction's fills are never split across pages; `next`
 * is where the following page starts.
 */
async function readFills(
	chainId: number,
	bases: readonly Address[] | undefined,
	before: number | undefined,
): Promise<{ fills: DexFill[]; next: number | undefined }> {
	// A route's swaps fill on the books of its legs' base tokens.
	const onBooks = bases
		? `AND "orderId" IN (SELECT "orderId" FROM dex_orders
			WHERE address = '${stablecoinDex}' AND token IN (${list(bases)}))`
		: ''
	const rows = await indexer(
		chainId,
		`SELECT ${fillColumns} FROM dex_fills
		WHERE address = '${stablecoinDex}' ${onBooks}
		${before === undefined ? '' : `AND block_num < ${before}`}
		ORDER BY block_num DESC, log_idx DESC LIMIT ${FILLS}`,
	)
	const fills = parseFills(rows)
	if (rows.length < FILLS) return { fills, next: undefined }
	const oldest = Math.min(...fills.map((fill) => fill.block))
	const complete = fills.filter((fill) => fill.block > oldest)
	if (complete.length > 0) return { fills: complete, next: oldest + 1 }
	// The whole page is one block: read all of it, which gas bounds, then
	// move past it.
	const block = await indexer(
		chainId,
		`SELECT ${fillColumns} FROM dex_fills
		WHERE address = '${stablecoinDex}' ${onBooks} AND block_num = ${oldest}
		ORDER BY log_idx DESC LIMIT ${BLOCK_FILLS}`,
	)
	return { fills: parseFills(block), next: oldest }
}

/**
 * Every fill in some transactions, so a route's swap is grouped from all of
 * its hops rather than only those on the route's books.
 */
async function readTransactionFills(
	chainId: number,
	fills: readonly DexFill[],
): Promise<DexFill[]> {
	const hashes = new Set(fills.map((fill) => fill.transactionHash))
	if (hashes.size === 0) return []
	return parseFills(
		await indexer(
			chainId,
			`SELECT ${fillColumns} FROM dex_fills
			WHERE address = '${stablecoinDex}' AND tx_hash IN (${list(hashes)})
			ORDER BY block_num DESC, log_idx DESC`,
		),
	)
}

function parseFills(rows: Row[]): DexFill[] {
	return rows.flatMap((row): DexFill[] => {
		const transactionHash = String(row.tx_hash).toLowerCase()
		const taker = addressOf(row.taker)
		const id = String(row.id)
		const amount = String(row.amount)
		if (!hexHash.test(transactionHash) || !taker || !orderId.test(id)) return []
		if (!/^\d+$/.test(amount)) return []
		return [
			{
				block: Number(row.block_num),
				log: Number(row.log_idx),
				transactionHash: transactionHash as Hex,
				timestamp: Number(row.ts),
				orderId: id,
				taker,
				amount: BigInt(amount),
			},
		]
	})
}

/**
 * Each order's state before the page's fills: its placement, the newest
 * flip before the page, and flips within it. Older flips are never needed.
 */
async function readOrderStates(
	chainId: number,
	fills: readonly DexFill[],
): Promise<Map<string, DexOrderState[]>> {
	const ids = [...new Set(fills.map((fill) => fill.orderId))].join(', ')
	const first = Math.min(...fills.map((fill) => fill.block))
	const last = Math.max(...fills.map((fill) => fill.block))
	const columns = `toString("orderId") AS id, token, "isBid" AS bid, tick, block_num, log_idx`
	const orders = `address = '${stablecoinDex}' AND "orderId" IN (${ids})`
	const [placed, earlier, within] = await Promise.all([
		indexer(chainId, `SELECT ${columns} FROM dex_orders WHERE ${orders}`),
		indexer(
			chainId,
			`SELECT toString("orderId") AS id,
			argMax(token, tuple(block_num, log_idx)) AS token,
			argMax("isBid", tuple(block_num, log_idx)) AS bid,
			argMax(tick, tuple(block_num, log_idx)) AS tick,
			max(block_num) AS flipped_block,
			argMax(log_idx, tuple(block_num, log_idx)) AS flipped_log
			FROM orderflipped WHERE ${orders} AND block_num < ${first}
			GROUP BY "orderId"`,
			orderFlipped,
		),
		indexer(
			chainId,
			`SELECT ${columns} FROM orderflipped
			WHERE ${orders} AND block_num >= ${first} AND block_num <= ${last}`,
			orderFlipped,
		),
	])
	const states = new Map<string, DexOrderState[]>()
	const latest = earlier.map((row) => ({
		...row,
		block_num: row.flipped_block,
		log_idx: row.flipped_log,
	}))
	for (const [id, state] of orderStates([...placed, ...latest, ...within]))
		append(states, id, state)
	return states
}

type FillBook = {
	fill: DexFill
	order: DexOrderState
	base: DexPoolToken
	quote: DexPoolToken
	/** The base's quote tokens were read rather than assumed. */
	exact: boolean
	/** The book is the one the base routes through now. */
	active: boolean
}

/**
 * The book each fill filled on: its order's base token, and the quote token
 * that base routed through when it filled. `undetermined` counts fills that
 * predate the switch history kept for their base, whose book can't be known.
 */
async function readFillBooks(
	chainId: number,
	fills: readonly DexFill[],
	blockNumber: bigint,
): Promise<{ books: FillBook[]; undetermined: number }> {
	const states = await readOrderStates(chainId, fills)
	const bases = new Set(
		[...states.values()].flatMap((list) => list.map((state) => state.token)),
	)
	if (bases.size === 0) return { books: [], undetermined: 0 }
	const [switches, pairRows] = await Promise.all([
		readQuoteSwitches(chainId, bases),
		indexer(
			chainId,
			`SELECT base, quote FROM dex_pairs WHERE base IN (${list(bases)})`,
		),
	])
	const books = new Map<Address, Address[]>()
	for (const row of pairRows) {
		const base = addressOf(row.base)
		const quote = addressOf(row.quote)
		if (base && quote) append(books, base, quote)
	}
	const tokens = await readTokens(
		chainId,
		[...new Set([...bases, ...[...books.values()].flat()])],
		blockNumber,
	)

	let undetermined = 0
	const resolved = fills.flatMap((fill) => {
		const order = orderAt(states.get(fill.orderId) ?? [], fill)
		const base = order && tokens.get(order.token)
		if (!order || !base) return []
		const history = switches.get(order.token) ?? []
		// Only the newest switches are kept, so an older fill's book is unknown.
		const oldest = history[history.length - 1]
		if (
			history.length >= MAX_SWITCHES &&
			oldest &&
			fill.timestamp < oldest.at
		) {
			undetermined++
			return []
		}
		const original = history.length
			? originalQuote({
					books: books.get(order.token) ?? [],
					switches: history,
					nextQuote: base.nextQuoteToken,
				})
			: base.quoteToken
		// Only a fill from before the first switch needs the original quote.
		const routed = quoteAt(history, original, fill.timestamp)
		const quote = routed && tokens.get(routed)
		if (!quote) return []
		return [
			{
				fill,
				order,
				base: base.token,
				quote: quote.token,
				exact: !base.assumedQuote,
				active: quote.token.address === base.quoteToken,
			},
		]
	})
	return { books: resolved, undetermined }
}

/** One page of fills as swaps, newest first. */
async function assembleSwaps(
	chainId: number,
	fills: readonly DexFill[],
	blockNumber: bigint,
): Promise<DexSwap[]> {
	const { books } = await readFillBooks(chainId, fills, blockNumber)
	const tokens = new Map(
		books.flatMap(({ base, quote }) => [
			[base.address, base],
			[quote.address, quote],
		]),
	)
	const hops = books.map(({ fill, order, base, quote }) => ({
		...fillHop(fill.amount, order, quote, base.decimals),
		transactionHash: fill.transactionHash,
		taker: fill.taker,
		timestamp: fill.timestamp,
		log: fill.log,
	}))
	return groupSwaps(hops).flatMap((row): DexSwap[] => {
		const from = tokens.get(row.from)
		const to = tokens.get(row.to)
		if (!from || !to) return []
		return [
			{
				id: row.id,
				transactionHash: row.transactionHash,
				timestamp: row.timestamp,
				taker: row.taker,
				from,
				to,
				amountIn: Number(formatUnits(row.amountIn, from.decimals)),
				amountOut: Number(formatUnits(row.amountOut, to.decimals)),
			},
		]
	})
}

/**
 * Swaps are assembled from indexed fills rather than the Tempo API's swap
 * feed, which prices every fill against a base's first quote token and so
 * splits routes through a token that has since switched quote tokens.
 * Pages are read until enough swaps match, so fills the page filters out,
 * such as unverified spam, can't empty the feed.
 */
export async function getDexSwaps(
	input: DexSwapsInput = {},
): Promise<DexSwap[]> {
	const chainId = getTempoChain().id
	const { path, unverified = false } = input
	const bases = input.bases ?? path
	const [verified, blockNumber] = await Promise.all([
		readVerified(chainId),
		getBatchedClient().getBlockNumber(),
	])
	const [first, last] = path ? [path[0], path[path.length - 1]] : []
	const matches = (swap: DexSwap) =>
		(unverified || (swap.from.verified && swap.to.verified)) &&
		(!path ||
			(swap.from.address === first && swap.to.address === last) ||
			(swap.from.address === last && swap.to.address === first))
	// Fail closed: without the registry, no swap is verified.
	if (!unverified && verified.size === 0) return []

	const swaps: DexSwap[] = []
	let before: number | undefined
	for (let page = 0; page < PAGES && swaps.length < SWAPS; page++) {
		const { fills, next } = await readFills(chainId, bases, before)
		// A route's page holds only its books' fills; load each transaction's
		// other hops so routed swaps group correctly.
		const page = bases ? await readTransactionFills(chainId, fills) : fills
		if (page.length > 0)
			swaps.push(
				...(await assembleSwaps(chainId, page, blockNumber)).filter(matches),
			)
		if (next === undefined) break
		before = next
	}
	return swaps.slice(0, SWAPS)
}

const inputSchema = z.object({
	path: z.optional(
		z
			.array(zAddress({ lowercase: true }))
			.check(z.minLength(2), z.maxLength(16)),
	),
	/** Base tokens of the route's books; defaults to the path. */
	bases: z.optional(
		z
			.array(zAddress({ lowercase: true }))
			.check(z.minLength(1), z.maxLength(16)),
	),
	unverified: z.optional(z.boolean()),
})

/**
 * Optionally only swaps between a route's two ends, in either direction;
 * swaps with an unverified token are left out unless `unverified` is set.
 */
export type DexSwapsInput = z.infer<typeof inputSchema>

export const fetchDexSwaps = createServerFn({ method: 'GET' })
	.inputValidator((input: DexSwapsInput | undefined) =>
		inputSchema.parse(input ?? {}),
	)
	.handler(async ({ data }): Promise<DexSwap[]> => {
		try {
			return await withImmutableDataCache({
				key: `dex-swaps:v3:${getTempoChain().id}:${data.path?.join(',') ?? 'all'}:${data.bases?.join(',') ?? ''}:${data.unverified ? 'all' : 'verified'}`,
				ttlSeconds: 5,
				load: () => withDeadline(getDexSwaps(data)),
				shouldCache: (swaps) => swaps.length > 0,
			})
		} catch (error) {
			console.error('Failed to load Stablecoin DEX swaps:', error)
			throw new Error(
				'Stablecoin DEX swaps are temporarily unavailable. Please try again.',
			)
		}
	})

/**
 * A transaction's Stablecoin DEX fills, each with the book it filled on.
 * `complete` is false while any fill's book is unresolved or assumed, such
 * as when the indexer trails the transaction or a token read failed.
 */
export async function getDexTransactionFills(
	hash: Hex,
): Promise<DexTransactionFills> {
	const chainId = getTempoChain().id
	const transactionHash = hash.toLowerCase()
	if (!hexHash.test(transactionHash)) return { fills: [], complete: false }
	const fills = parseFills(
		await indexer(
			chainId,
			`SELECT ${fillColumns} FROM dex_fills
			WHERE address = '${stablecoinDex}' AND tx_hash = '${transactionHash}'
			ORDER BY log_idx`,
		),
	)
	if (fills.length === 0) return { fills: [], complete: false }
	const { books, undetermined } = await readFillBooks(
		chainId,
		fills,
		await getBatchedClient().getBlockNumber(),
	)
	return {
		fills: books.map(({ fill, base, quote, active }) => ({
			log: fill.log,
			base,
			quote,
			active,
			amount: String(fill.amount),
		})),
		// An undetermined fill never resolves, so it doesn't hold up caching.
		complete:
			books.length + undetermined === fills.length &&
			books.every((book) => book.exact),
	}
}

export const fetchDexTransactionFills = createServerFn({ method: 'GET' })
	.inputValidator((input: { hash: Hex }) =>
		z.object({ hash: zHash() }).parse(input),
	)
	.handler(async ({ data }): Promise<DexTransactionFills> => {
		try {
			return await withImmutableDataCache({
				key: `dex-transaction-fills:v3:${getTempoChain().id}:${data.hash.toLowerCase()}`,
				load: () => withDeadline(getDexTransactionFills(data.hash)),
				// Retry an incomplete result rather than keep it.
				shouldCache: (result) => result.complete,
			})
		} catch (error) {
			console.error('Failed to load Stablecoin DEX fills:', error)
			return { fills: [], complete: false }
		}
	})
