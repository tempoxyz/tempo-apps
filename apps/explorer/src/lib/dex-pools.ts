import type { Address, Hex } from 'viem'
import * as z from 'zod/mini'

/**
 * How swaps treat a book. A base token routes through the book against its
 * `quoteToken()`; a book against its staged `nextQuoteToken()` accepts orders
 * but no swaps (TIP-1001); any other book is left over from an earlier quote.
 */
export type DexPoolStatus = 'active' | 'place-only' | 'retired'

export type DexPoolToken = {
	address: Address
	symbol: string
	decimals: number
	verified: boolean
}

export type DexPoolVolume = { day: number; month: number }

export type DexPool = {
	key: Hex
	base: DexPoolToken
	quote: DexPoolToken
	status: DexPoolStatus
	/** Best prices in quote per base, or null when that side is empty. */
	bid: number | null
	ask: number | null
	/**
	 * Resting orders at par: bids in quote-token units, asks in base-token
	 * units. Null for books swaps don't route through, or that could not be
	 * read.
	 */
	liquidity: {
		bid: number
		ask: number
		total: number
		/** Some reads failed or were capped, so the total is a lower bound. */
		partial: boolean
	} | null
	volume: DexPoolVolume
}

export type DexPoolsSnapshot = {
	blockNumber: string
	generatedAt: number
	pools: DexPool[]
}

export const emptyVolume: DexPoolVolume = { day: 0, month: 0 }

/** Adds to a keyed list in place. */
export function append<key, value>(
	map: Map<key, value[]>,
	key: key,
	value: value,
): void {
	const list = map.get(key)
	if (list) list.push(value)
	else map.set(key, [value])
}

const equal = (a: string | null | undefined, b: string | null | undefined) =>
	Boolean(a && b && a.toLowerCase() === b.toLowerCase())

export function bookStatus(
	quote: Address,
	base: { quoteToken: Address; nextQuoteToken: Address },
): DexPoolStatus {
	if (equal(quote, base.quoteToken)) return 'active'
	if (equal(quote, base.nextQuoteToken)) return 'place-only'
	return 'retired'
}

/** `price = (PRICE_SCALE + tick) / PRICE_SCALE`, quote per base. */
export function tickPrice(tick: number): number {
	return (100_000 + tick) / 100_000
}

export function spreadBps(bid: number | null, ask: number | null) {
	if (bid === null || ask === null) return null
	return ((ask - bid) / ((ask + bid) / 2)) * 10_000
}

/**
 * Values one side of a book. Tick liquidity is base-denominated; resting
 * bids lock quote tokens at their tick price, rescaled to quote decimals.
 */
export function sideValue(
	levels: readonly { tick: number; liquidity: bigint }[],
	options: { isBid: boolean; baseDecimals: number; quoteDecimals: number },
): bigint {
	let total = 0n
	for (const { tick, liquidity } of levels) {
		if (!options.isBid) {
			total += liquidity
			continue
		}
		const quote = (liquidity * BigInt(100_000 + tick)) / 100_000n
		total +=
			options.quoteDecimals >= options.baseDecimals
				? quote * 10n ** BigInt(options.quoteDecimals - options.baseDecimals)
				: quote / 10n ** BigInt(options.baseDecimals - options.quoteDecimals)
	}
	return total
}

/**
 * The quote a base had before its first switch: its book other than the
 * first switch's target and a staged next quote. A token can return to an
 * earlier quote, so later targets are only ruled out to break a tie.
 */
export function originalQuote(input: {
	books: readonly Address[]
	/** Every switch, newest first. */
	switches: readonly { quote: Address }[]
	nextQuote: Address | null
}): Address | null {
	const first = input.switches[input.switches.length - 1]?.quote
	const current = input.switches[0]?.quote
	const staged = equal(input.nextQuote, current) ? null : input.nextQuote
	const candidates = input.books.filter(
		(quote) => !equal(quote, first) && !equal(quote, staged),
	)
	if (candidates.length === 1) return candidates[0] ?? null
	const later = input.switches.slice(0, -1)
	const narrowed = candidates.filter(
		(quote) => !later.some((entry) => equal(entry.quote, quote)),
	)
	return narrowed.length === 1 ? (narrowed[0] ?? null) : null
}

/** Fills between two quote switches; null bounds are open. */
export type VolumeInterval = {
	from: number | null
	to: number | null
	/** The quote swaps routed through then; null when unknown. */
	quote: Address | null
}

/**
 * Splits a window at each quote switch inside it, newest first. Fills after
 * a switch went to its new quote; fills before the oldest one went to the
 * quote it replaced.
 */
export function volumeIntervals(input: {
	/** Every switch, newest first. */
	switches: readonly { quote: Address; at: number }[]
	windowStart: number
	original: Address | null
}): VolumeInterval[] {
	const inside = input.switches.filter((entry) => entry.at > input.windowStart)
	if (inside.length === 0) return [{ from: null, to: null, quote: null }]
	return [
		...inside.map((entry, index) => ({
			from: entry.at,
			to: inside[index - 1]?.at ?? null,
			quote: entry.quote,
		})),
		{
			from: null,
			to: inside[inside.length - 1]?.at ?? null,
			quote: input.switches[inside.length]?.quote ?? input.original,
		},
	]
}

/**
 * Credits each interval to the book of the quote it routed through, and an
 * interval with an unknown quote to the routed book, so nothing is dropped.
 */
export function volumeForBook(input: {
	quote: Address
	routedQuote: Address
	intervals: readonly { quote: Address | null; volume: DexPoolVolume }[]
}): DexPoolVolume {
	return input.intervals.reduce(
		(sum, interval) =>
			equal(interval.quote ?? input.routedQuote, input.quote)
				? {
						day: sum.day + interval.volume.day,
						month: sum.month + interval.volume.month,
					}
				: sum,
		emptyVolume,
	)
}

export const dexPoolSorts = ['liquidity', 'spread', 'day', 'month'] as const

export type DexPoolSort = (typeof dexPoolSorts)[number]

export const dexPoolsSearchSchema = z.object({
	tab: z._default(z.enum(['pairs', 'swaps']), 'pairs'),
	sort: z._default(z.enum(dexPoolSorts), 'liquidity'),
	dir: z._default(z.enum(['asc', 'desc']), 'desc'),
	unverified: z._default(z.boolean(), false),
})

export type DexPoolsSearch = z.infer<typeof dexPoolsSearchSchema>

export const defaultDexPoolsSearch: DexPoolsSearch = {
	tab: 'pairs',
	sort: 'liquidity',
	dir: 'desc',
	unverified: false,
}

function sortValue(pool: DexPool, sort: DexPoolSort): number | null {
	// A partial zero is unreadable, not empty, and is shown as unknown.
	if (sort === 'liquidity')
		return !pool.liquidity ||
			(pool.liquidity.partial && pool.liquidity.total === 0)
			? null
			: pool.liquidity.total
	if (sort === 'spread') return spreadBps(pool.bid, pool.ask)
	return pool.volume[sort]
}

/** Unknown values sort last in either direction. */
export function sortPools(
	pools: readonly DexPool[],
	sort: DexPoolSort,
	dir: 'asc' | 'desc',
): DexPool[] {
	return [...pools].sort((a, b) => {
		const left = sortValue(a, sort)
		const right = sortValue(b, sort)
		if (left === null || right === null)
			return left === right ? 0 : left === null ? 1 : -1
		return (dir === 'asc' ? left - right : right - left) || 0
	})
}

export function matchesPoolQuery(pool: DexPool, query: string): boolean {
	const needle = query.trim().toLowerCase()
	if (!needle) return true
	return [pool.base, pool.quote].some(
		(token) =>
			token.symbol.toLowerCase().includes(needle) ||
			token.address.toLowerCase() === needle,
	)
}
