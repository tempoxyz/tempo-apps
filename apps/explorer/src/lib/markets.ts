import type { Address, Hex } from 'viem'
import * as z from 'zod/mini'
import {
	type DexPool,
	type DexPoolStatus,
	type DexPoolToken,
	spreadBps,
} from '#lib/dex-pools'
import type { DexSwap } from '#lib/dex-swaps'
import { isTip20Address } from '#lib/domain/tip20'
import type {
	PropAmmPool,
	PropAmmState,
	PropAmmTotals,
	PropAmmTrade,
} from '#lib/propamm'
import { stateLabels } from '#lib/propamm'

/**
 * Markets lists every pair on Tempo's two venues side by side: Stablecoin
 * DEX order books and propAMM pools. Each venue loads on its own, so one
 * failing leaves the other's rows and marks the totals partial.
 */
export const marketVenues = ['dex', 'propamm'] as const
export type MarketVenue = (typeof marketVenues)[number]

export const venueLabels: Record<MarketVenue, string> = {
	dex: 'Stablecoin DEX',
	propamm: 'PropAMM',
}

/**
 * One vocabulary for both venues:
 * - live: takes swaps or fills now.
 * - limited: listed, but trades only partly or not at the moment: a DEX
 *   book that accepts orders but no swaps yet, or a propAMM quote that
 *   expired, went stale or has a side switched off.
 * - off: retired, paused or closed.
 */
export type MarketStatus = 'live' | 'limited' | 'off'

export const statusIntent: Record<
	MarketStatus,
	'positive' | 'warning' | 'neutral'
> = { live: 'positive', limited: 'warning', off: 'neutral' }

export const statusLabels: Record<MarketStatus, string> = {
	live: 'Live',
	limited: 'Limited',
	off: 'Off',
}

export function dexStatus(status: DexPoolStatus): {
	status: MarketStatus
	detail: string | null
} {
	if (status === 'active') return { status: 'live', detail: null }
	if (status === 'place-only')
		return { status: 'limited', detail: 'Place only' }
	return { status: 'off', detail: 'Retired' }
}

export function propAmmStatus(state: PropAmmState): {
	status: MarketStatus
	detail: string | null
} {
	switch (state) {
		case 'live':
			return { status: 'live', detail: null }
		case 'expired':
		case 'off':
		case 'bids_only':
		case 'asks_only':
		case 'stale':
			return { status: 'limited', detail: stateLabels[state] }
		case 'paused':
		case 'closed':
		case 'unknown':
			return { status: 'off', detail: stateLabels[state] }
	}
}

/** Where a row leads: a pair page, or the pool's contract. */
export type MarketLink =
	| { kind: 'pair'; from: Address; to: Address }
	| { kind: 'address'; address: Address }

export function marketHref(link: MarketLink): string {
	return link.kind === 'pair'
		? `/dex/${link.from}/${link.to}`
		: `/address/${link.address}`
}

export type MarketRow = {
	key: string
	venue: MarketVenue
	base: DexPoolToken
	quote: DexPoolToken
	/** Quote per base: the DEX mid of best bid and ask, or the propAMM price. */
	price: number | null
	/**
	 * In US dollars; null when unknown. DEX liquidity is resting orders at
	 * par (bids in quote units, asks in base units) counted as dollars, as
	 * the Stablecoin DEX page always has. A propAMM row is its inventory,
	 * which a v2 venue's pairs share.
	 */
	liquidity: { value: number; partial: boolean } | null
	/** DEX only, in basis points. */
	spread: number | null
	/** Null while unknown: propAMM trades loading or unavailable. */
	volume: { day: number; month: number } | null
	status: MarketStatus
	/** The venue's own word for a status that isn't plain live. */
	statusDetail: string | null
	/** The propAMM pool's contract and version. */
	pool: { address: Address; version: 'v1' | 'v2' } | null
	link: MarketLink
}

/**
 * Books swaps route through, and any other book that still has volume in
 * the last 30 days, so every book the volume totals count has a row.
 */
export function dexRows(pools: readonly DexPool[]): MarketRow[] {
	return pools
		.filter((pool) => pool.status !== 'retired' || pool.volume.month > 0)
		.map((pool) => {
			const { status, detail } = dexStatus(pool.status)
			const { liquidity } = pool
			return {
				key: `dex-${pool.key}`,
				venue: 'dex',
				base: pool.base,
				quote: pool.quote,
				price:
					pool.bid !== null && pool.ask !== null
						? (pool.bid + pool.ask) / 2
						: null,
				// A partial zero means no level could be read, not an empty book.
				liquidity:
					!liquidity || (liquidity.partial && liquidity.total === 0)
						? null
						: { value: liquidity.total, partial: liquidity.partial },
				spread: spreadBps(pool.bid, pool.ask),
				volume: pool.volume,
				status,
				statusDetail: detail,
				pool: null,
				link: {
					kind: 'pair',
					from: pool.base.address,
					to: pool.quote.address,
				},
			}
		})
}

/**
 * A propAMM pool leads to the pair page, which lists it beside the DEX
 * route. That page routes between any two TIP-20 tokens through their quote
 * tokens, so a pool with a token outside TIP-20 leads to its contract.
 */
export function propAmmRows(
	pools: readonly PropAmmPool[],
	volume: Record<string, PropAmmTotals> | undefined,
): MarketRow[] {
	return pools.map((pool) => {
		const { status, detail } = propAmmStatus(pool.state)
		return {
			key: `propamm-${pool.key}`,
			venue: 'propamm',
			base: pool.base,
			quote: pool.quote,
			price: pool.price,
			liquidity:
				pool.inventory === null
					? null
					: {
							value: pool.inventory,
							partial: pool.baseValue === null || pool.quoteValue === null,
						},
			spread: null,
			volume: volume
				? (volume[pool.key]?.volume ?? { day: 0, month: 0 })
				: null,
			status,
			statusDetail: detail,
			pool: { address: pool.address, version: pool.version },
			link:
				isTip20Address(pool.base.address) && isTip20Address(pool.quote.address)
					? { kind: 'pair', from: pool.base.address, to: pool.quote.address }
					: { kind: 'address', address: pool.address },
		}
	})
}

export const marketSorts = ['liquidity', 'spread', 'day', 'month'] as const
export type MarketSort = (typeof marketSorts)[number]

function sortValue(row: MarketRow, sort: MarketSort): number | null {
	if (sort === 'liquidity') return row.liquidity?.value ?? null
	if (sort === 'spread') return row.spread
	return row.volume?.[sort] ?? null
}

/** Unknown values sort last in either direction; ties keep their order. */
export function sortMarkets(
	rows: readonly MarketRow[],
	sort: MarketSort,
	dir: 'asc' | 'desc',
): MarketRow[] {
	return [...rows].sort((a, b) => {
		const left = sortValue(a, sort)
		const right = sortValue(b, sort)
		if (left === null || right === null)
			return left === right ? 0 : left === null ? 1 : -1
		return (dir === 'asc' ? left - right : right - left) || 0
	})
}

/** One read: its data once loaded, and whether it failed without any. */
export type VenueRead<data> = { data: data | undefined; failed: boolean }

/**
 * A headline figure: null while a read it needs is loading, unknown when
 * every read it sums failed, and partial (a lower bound) when any failed or
 * came back incomplete.
 */
export type MarketTotal = {
	value: number
	partial: boolean
	unknown: boolean
} | null

export type MarketTotals = {
	liquidity: MarketTotal
	day: MarketTotal
	month: MarketTotal
}

export function marketTotals(input: {
	venues: readonly MarketVenue[]
	dex: VenueRead<readonly DexPool[]>
	propAmm: VenueRead<{ pools: readonly PropAmmPool[]; complete: boolean }>
	propAmmTrades: VenueRead<Record<string, PropAmmTotals>>
}): MarketTotals {
	const parts = {
		liquidity: [] as Part[],
		day: [] as Part[],
		month: [] as Part[],
	}

	if (input.venues.includes('dex')) {
		const pools = input.dex.data
		const part = (value: (pools: readonly DexPool[]) => Part): Part =>
			pools ? value(pools) : { state: input.dex.failed ? 'failed' : 'loading' }
		parts.liquidity.push(
			part((pools) => {
				// Only books swaps route through hold liquidity.
				let value = 0
				let partial = false
				for (const pool of pools) {
					if (pool.status !== 'active') continue
					value += pool.liquidity?.total ?? 0
					partial ||= !pool.liquidity || pool.liquidity.partial
				}
				// No level could be read: unknown, not a lower bound of zero.
				if (partial && value === 0) return { state: 'failed' }
				return { state: 'known', value, partial }
			}),
		)
		// Volume includes fills on books a token has since moved off.
		for (const window of ['day', 'month'] as const)
			parts[window].push(
				part((pools) => ({
					state: 'known',
					value: pools.reduce((sum, pool) => sum + pool.volume[window], 0),
					partial: false,
				})),
			)
	}

	if (input.venues.includes('propamm')) {
		const snapshot = input.propAmm.data
		parts.liquidity.push(
			snapshot
				? propAmmInventory(snapshot.pools, snapshot.complete)
				: { state: input.propAmm.failed ? 'failed' : 'loading' },
		)
		const totals = input.propAmmTrades.data
		for (const window of ['day', 'month'] as const)
			parts[window].push(
				totals
					? {
							state: 'known',
							// Every pool's trades count, even one the pools read missed.
							value: Object.values(totals).reduce(
								(sum, total) => sum + total.volume[window],
								0,
							),
							partial: false,
						}
					: { state: input.propAmmTrades.failed ? 'failed' : 'loading' },
			)
	}

	return {
		liquidity: combine(parts.liquidity),
		day: combine(parts.day),
		month: combine(parts.month),
	}
}

/**
 * A v2 venue's balances back all of its pairs, so each venue's token
 * balance counts once, valued by the first listed pair that holds it so
 * sorting can't change the total.
 */
export function propAmmInventory(
	pools: readonly PropAmmPool[],
	complete: boolean,
): Part {
	let partial = !complete
	const held = new Map<string, number>()
	const hold = (key: string, value: number) => {
		if (!held.has(key)) held.set(key, value)
	}
	for (const pool of pools) {
		if (pool.baseValue === null || pool.quoteValue === null) partial = true
		if (pool.baseValue !== null)
			hold(`${pool.address}-${pool.base.address}`, pool.baseValue)
		if (pool.quoteValue !== null)
			hold(`${pool.address}-${pool.quote.address}`, pool.quoteValue)
	}
	let value = 0
	for (const amount of held.values()) value += amount
	return { state: 'known', value, partial }
}

type Part =
	| { state: 'loading' | 'failed' }
	| { state: 'known'; value: number; partial: boolean }

function combine(parts: readonly Part[]): MarketTotal {
	if (parts.some((part) => part.state === 'loading')) return null
	let value = 0
	let partial = false
	let known = 0
	for (const part of parts) {
		if (part.state !== 'known') {
			partial = true
			continue
		}
		known++
		value += part.value
		partial ||= part.partial
	}
	return { value, partial, unknown: known === 0 }
}

/** A trade from either venue, from the taker's side. */
export type MarketTrade = {
	id: string
	venue: MarketVenue
	transactionHash: Hex
	timestamp: number
	taker: Address
	/**
	 * Buy or sell of the base for the quote; null for a DEX swap routed
	 * through more than one book, shown as a swap of one token for another.
	 */
	side: 'buy' | 'sell' | null
	/** For a routed swap, the token sold. */
	base: DexPoolToken
	/** For a routed swap, the token bought. */
	quote: DexPoolToken
	baseAmount: number
	quoteAmount: number
	/** In US dollars; null when neither side is a USD token. */
	value: number | null
}

/**
 * A DEX swap is a buy when it bought a book's base with that book's quote
 * and a sell the other way round. Its value is what it paid at par, as the
 * Stablecoin DEX page shows it.
 */
export function dexTrade(
	swap: DexSwap,
	pools: readonly DexPool[] | undefined,
): MarketTrade {
	const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
	const book = pools?.find(
		(pool) =>
			(same(pool.base.address, swap.to.address) &&
				same(pool.quote.address, swap.from.address)) ||
			(same(pool.base.address, swap.from.address) &&
				same(pool.quote.address, swap.to.address)),
	)
	const common = {
		id: `dex-${swap.id}`,
		venue: 'dex',
		transactionHash: swap.transactionHash,
		timestamp: swap.timestamp,
		taker: swap.taker,
		value: swap.amountIn,
	} as const
	if (book && same(book.base.address, swap.to.address))
		return {
			...common,
			side: 'buy',
			base: swap.to,
			quote: swap.from,
			baseAmount: swap.amountOut,
			quoteAmount: swap.amountIn,
		}
	return {
		...common,
		side: book ? 'sell' : null,
		base: swap.from,
		quote: swap.to,
		baseAmount: swap.amountIn,
		quoteAmount: swap.amountOut,
	}
}

/** A propAMM fill, labelled by its pool; null when the pool isn't listed. */
export function propAmmTrade(
	trade: PropAmmTrade,
	pools: ReadonlyMap<string, PropAmmPool>,
): MarketTrade | null {
	const pool = pools.get(trade.poolKey)
	if (!pool) return null
	return {
		id: `propamm-${trade.id}`,
		venue: 'propamm',
		transactionHash: trade.transactionHash,
		timestamp: trade.timestamp,
		taker: trade.taker,
		side: trade.baseIn ? 'sell' : 'buy',
		base: pool.base,
		quote: pool.quote,
		baseAmount: trade.baseAmount,
		quoteAmount: trade.quoteAmount,
		value: trade.value,
	}
}

/** Newest first; trades in one second keep their venue's order. */
export function mergeTrades(
	...lists: readonly (readonly MarketTrade[])[]
): MarketTrade[] {
	return lists
		.flat()
		.map((trade, index) => ({ trade, index }))
		.sort((a, b) => b.trade.timestamp - a.trade.timestamp || a.index - b.index)
		.map(({ trade }) => trade)
}

export const marketsSearchSchema = z.object({
	venue: z._default(z.enum(['all', ...marketVenues]), 'all'),
	tab: z._default(z.enum(['pairs', 'trades']), 'pairs'),
	sort: z._default(z.enum(marketSorts), 'liquidity'),
	dir: z._default(z.enum(['asc', 'desc']), 'desc'),
	unverified: z._default(z.boolean(), false),
})

export type MarketsSearch = z.infer<typeof marketsSearchSchema>

export const defaultMarketsSearch: MarketsSearch = {
	venue: 'all',
	tab: 'pairs',
	sort: 'liquidity',
	dir: 'desc',
	unverified: false,
}

export function venuesOf(venue: MarketsSearch['venue']): MarketVenue[] {
	return venue === 'all' ? [...marketVenues] : [venue]
}

/** The search of an old /dex or /propamm link, read loosely. */
export type LegacySearch = {
	tab?: string | undefined
	sort?: string | undefined
	dir?: string | undefined
	unverified?: boolean | undefined
}

export function legacySearch(search: Record<string, unknown>): LegacySearch {
	const text = (value: unknown) =>
		typeof value === 'string' ? value : undefined
	return {
		tab: text(search.tab),
		sort: text(search.sort),
		dir: text(search.dir),
		unverified: search.unverified === true || undefined,
	}
}

/**
 * The Markets search an old /dex or /propamm link maps to, so a stale or
 * hand-edited link still lands on Markets.
 */
export function legacyMarketsSearch(
	venue: MarketVenue,
	search: LegacySearch,
): Partial<MarketsSearch> {
	const result: Partial<MarketsSearch> = { venue }
	if (search.tab === 'swaps' || search.tab === 'trades') result.tab = 'trades'
	const sort = search.sort === 'inventory' ? 'liquidity' : search.sort
	if (marketSorts.includes(sort as MarketSort)) result.sort = sort as MarketSort
	if (search.dir === 'asc' || search.dir === 'desc') result.dir = search.dir
	if (search.unverified) result.unverified = true
	return result
}
