import type { Address, Hex } from 'viem'
import * as z from 'zod/mini'
import type { DexPoolToken } from '#lib/dex-pools'

/**
 * propAMM pools (tempoxyz/propAMM): permissioned venues where one market
 * maker trades its own inventory with approved takers. v1 pools are
 * DirectPropAMM contracts priced by an oracle; a v2 venue serves many pairs
 * from one inventory at a mid its maker posts.
 *
 * Pools are listed rather than discovered: anyone can deploy a contract that
 * emits propAMM events, so only these are shown.
 */
export type PropAmmPoolConfig = {
	version: 'v1' | 'v2'
	address: Address
	/** The pair's index on a v2 venue; 0 for a v1 pool. */
	pairIndex: number
	/** Who runs the pool. */
	maker: string
}

export const propAmmPools: Record<number, readonly PropAmmPoolConfig[]> = {
	// Tempo mainnet.
	4217: [
		{
			// EURC.e/OUSD
			version: 'v2',
			address: '0x26ec6abf0da64f00e8bd342de9b89e0c7646e3e3',
			pairIndex: 0,
			maker: 'Capa',
		},
		{
			// PRIME/USDC.e
			version: 'v1',
			address: '0x2c22026217d2275f1883febf161863dc0b0a43b2',
			pairIndex: 0,
			maker: 'Lhava',
		},
		{
			// USDY/USDC.e
			version: 'v1',
			address: '0xa83da77c096a64ee730c6af28811f6db89ff462a',
			pairIndex: 0,
			maker: 'Lhava',
		},
		{
			// PRIME/pathUSD
			version: 'v1',
			address: '0x01ced4c2a58e947b2df3c2e0eb69829261fe6c4d',
			pairIndex: 0,
			maker: 'Tempo Cash',
		},
	],
}

export function propAmmPoolsFor(chainId: number): readonly PropAmmPoolConfig[] {
	// Addresses compare lowercase, however a pool is configured.
	return (propAmmPools[chainId] ?? []).map((pool) => ({
		...pool,
		address: pool.address.toLowerCase() as Address,
	}))
}

export function poolKey(pool: { address: string; pairIndex: number }): string {
	return `${pool.address.toLowerCase()}-${pool.pairIndex}`
}

/**
 * - live: takes fills at a current price.
 * - paused: the owner or guardian paused the pool, or halted the venue.
 * - closed: the v2 pair admits no takers.
 * - expired: the v2 maker's quote ran past its validity.
 * - off: the v2 maker switched both sides off.
 * - bids_only, asks_only: the v2 maker switched one side off.
 * - stale: the v1 oracle price is older than the pool accepts.
 * - unknown: the state couldn't be read.
 */
export type PropAmmState =
	| 'live'
	| 'paused'
	| 'closed'
	| 'expired'
	| 'off'
	| 'bids_only'
	| 'asks_only'
	| 'stale'
	| 'unknown'

export const stateLabels: Record<PropAmmState, string> = {
	live: 'Live',
	paused: 'Paused',
	closed: 'Closed',
	expired: 'Quote expired',
	off: 'Sides off',
	bids_only: 'Bids only',
	asks_only: 'Asks only',
	stale: 'Price stale',
	unknown: 'Unknown',
}

/** Status indicator intents, as ds.tehq.dev's StatusIndicator names them. */
export const stateIntent: Record<
	PropAmmState,
	'positive' | 'warning' | 'neutral'
> = {
	live: 'positive',
	paused: 'neutral',
	closed: 'neutral',
	expired: 'warning',
	off: 'warning',
	bids_only: 'warning',
	asks_only: 'warning',
	stale: 'warning',
	unknown: 'neutral',
}

export type PropAmmPool = {
	key: string
	version: 'v1' | 'v2'
	address: Address
	pairIndex: number
	maker: string
	base: DexPoolToken
	quote: DexPoolToken
	/** Quote per base: the v2 posted mid or the v1 oracle price. */
	price: number | null
	state: PropAmmState
	baseBalance: number
	quoteBalance: number
	/** Base and quote held, valued in the quote token. */
	inventory: number | null
	/** What a taker can buy: the base held, valued in the quote token; 0 while asks are off. */
	maxBuy: number | null
	/** What a taker can receive for base: the quote held; 0 while bids are off. */
	maxSell: number
	/** Null when trades couldn't be read. */
	volume: { day: number; month: number } | null
	trades: { day: number; month: number } | null
	/** Unix seconds of the latest trade in the last 30 days. */
	lastTradeAt: number | null
}

export type PropAmmTrade = {
	id: string
	poolKey: string
	transactionHash: Hex
	timestamp: number
	taker: Address
	/** The taker sold base for quote. */
	baseIn: boolean
	baseAmount: number
	/** Quote paid or received, which values the trade. */
	quoteAmount: number
}

export type PropAmmSnapshot = {
	generatedAt: number
	pools: PropAmmPool[]
	/** Null when the indexer couldn't be read, so volume is unknown, not zero. */
	trades: PropAmmTrade[] | null
}

/** A v2 hot word's fields (propAMM contracts/src/v2/libraries/HotWord.sol). */
export function decodeHotWord(word: bigint): {
	mid: bigint
	validUntil: number
	bidsOff: boolean
	asksOff: boolean
} {
	const flags = Number((word >> 240n) & 0xffffn)
	return {
		mid: word & ((1n << 96n) - 1n),
		validUntil: Number((word >> 168n) & ((1n << 40n) - 1n)),
		bidsOff: (flags & 1) !== 0,
		asksOff: (flags & 2) !== 0,
	}
}

/** v2 AccessMode: None, Closed, Listed, Open. */
const ACCESS_CLOSED = 1

export function v2State(input: {
	halted: boolean
	access: number
	mid: bigint
	validUntil: number
	bidsOff: boolean
	asksOff: boolean
	now: number
}): PropAmmState {
	// A removed or unknown pair reads as all zeros.
	if (input.access === 0) return 'unknown'
	if (input.halted) return 'paused'
	if (input.access === ACCESS_CLOSED) return 'closed'
	if (input.mid === 0n || input.validUntil < input.now) return 'expired'
	if (input.bidsOff && input.asksOff) return 'off'
	if (input.asksOff) return 'bids_only'
	if (input.bidsOff) return 'asks_only'
	return 'live'
}

export function v1State(input: {
	paused: boolean
	priceAt: number | null
	maxOracleAge: number | null
	now: number
}): PropAmmState {
	if (input.paused) return 'paused'
	if (input.priceAt === null || input.maxOracleAge === null) return 'unknown'
	if (input.now - input.priceAt > input.maxOracleAge) return 'stale'
	return 'live'
}

export type PropAmmTotals = {
	volume: { day: number; month: number }
	trades: { day: number; month: number }
	lastTradeAt: number | null
}

/** Each pool's 1D and 30D volume and trade count. */
export function tradeTotals(
	trades: readonly PropAmmTrade[],
	now: number,
): Map<string, PropAmmTotals> {
	const totals = new Map<string, PropAmmTotals>()
	const dayAgo = now - 86_400
	for (const trade of trades) {
		const total = totals.get(trade.poolKey) ?? {
			volume: { day: 0, month: 0 },
			trades: { day: 0, month: 0 },
			lastTradeAt: null,
		}
		total.volume.month += trade.quoteAmount
		total.trades.month += 1
		if (trade.timestamp >= dayAgo) {
			total.volume.day += trade.quoteAmount
			total.trades.day += 1
		}
		total.lastTradeAt = Math.max(total.lastTradeAt ?? 0, trade.timestamp)
		totals.set(trade.poolKey, total)
	}
	return totals
}

export const propAmmSorts = [
	'inventory',
	'maxBuy',
	'maxSell',
	'day',
	'month',
] as const
export type PropAmmSort = (typeof propAmmSorts)[number]

export const propAmmSearchSchema = z.object({
	tab: z._default(z.enum(['pools', 'trades']), 'pools'),
	sort: z._default(z.enum(propAmmSorts), 'inventory'),
	dir: z._default(z.enum(['asc', 'desc']), 'desc'),
})
export type PropAmmSearch = z.infer<typeof propAmmSearchSchema>
export const defaultPropAmmSearch: PropAmmSearch = {
	tab: 'pools',
	sort: 'inventory',
	dir: 'desc',
}

function sortValue(pool: PropAmmPool, sort: PropAmmSort): number {
	switch (sort) {
		case 'inventory':
			return pool.inventory ?? -1
		case 'maxBuy':
			return pool.maxBuy ?? -1
		case 'maxSell':
			return pool.maxSell
		case 'day':
			return pool.volume?.day ?? -1
		case 'month':
			return pool.volume?.month ?? -1
	}
}

export function sortPropAmmPools(
	pools: readonly PropAmmPool[],
	sort: PropAmmSort,
	dir: 'asc' | 'desc',
): PropAmmPool[] {
	const sign = dir === 'asc' ? 1 : -1
	return [...pools].sort(
		(a, b) =>
			sign * (sortValue(a, sort) - sortValue(b, sort)) ||
			a.base.symbol.localeCompare(b.base.symbol),
	)
}
