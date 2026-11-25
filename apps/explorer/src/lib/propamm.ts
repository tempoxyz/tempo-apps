import { type Address, type Hex, toEventSelector } from 'viem'
import { propAmmEventsAbi } from '#lib/abis'
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
	/** A v2 pair's tokens (IVenue.pair), which its maker's quotes name. */
	base?: Address
	quote?: Address
}

export const propAmmPools: Record<number, readonly PropAmmPoolConfig[]> = {
	// Tempo mainnet.
	4217: [
		{
			// EURC.e/OUSD
			version: 'v2',
			address: '0x26ec6abf0da64f00e8bd342de9b89e0c7646e3e3',
			pairIndex: 0,
			base: '0x20c0000000000000000000001621e21F71CF12fb',
			quote: '0x20c0000000000000000000006a37DA5C996874BE',
		},
		{
			// PRIME/USDC.e
			version: 'v1',
			address: '0x2c22026217d2275f1883febf161863dc0b0a43b2',
			pairIndex: 0,
		},
		{
			// USDY/USDC.e
			version: 'v1',
			address: '0xa83da77c096a64ee730c6af28811f6db89ff462a',
			pairIndex: 0,
		},
		{
			// PRIME/pathUSD
			version: 'v1',
			address: '0x01ced4c2a58e947b2df3c2e0eb69829261fe6c4d',
			pairIndex: 0,
		},
		{
			// PRIME/OUSD
			version: 'v1',
			address: '0x18f358b4724a9bef5d732660427ee80c1a44bdc3',
			pairIndex: 0,
		},
		{
			// DLUSD/OUSD, Deel's pool
			version: 'v1',
			address: '0x1e3423c85fe006d27091b9482caa9520c250f4c6',
			pairIndex: 0,
		},
	],
	// Moderato testnet: the live tEUR and tARS venue pairs.
	42431: [
		{
			// tEUR/pathUSD
			version: 'v2',
			address: '0xdc1ac50784c220d8caa587c3ba0f745d6de868c4',
			pairIndex: 0,
			base: '0x20C00000000000000000000097e2686297155240',
			quote: '0x20C0000000000000000000000000000000000000',
		},
		{
			// tARS/pathUSD
			version: 'v2',
			address: '0xdc1ac50784c220d8caa587c3ba0f745d6de868c4',
			pairIndex: 1,
			base: '0x20c000000000000000000000e59242Eff01Bc805',
			quote: '0x20C0000000000000000000000000000000000000',
		},
		{
			// OUSD/tARS
			version: 'v2',
			address: '0xdc1ac50784c220d8caa587c3ba0f745d6de868c4',
			pairIndex: 2,
			base: '0x20c0000000000000000000006a37DA5C996874BE',
			quote: '0x20c000000000000000000000e59242Eff01Bc805',
		},
		{
			// tEUR/pathUSD, a second tEUR token
			version: 'v2',
			address: '0xfd9621c4d8262b63d33b39c0f067ccb7cf55d5fa',
			pairIndex: 0,
			base: '0x20C00000000000000000000021c2be7d74fe9676',
			quote: '0x20C0000000000000000000000000000000000000',
		},
		{
			// tEUR/pathUSD, a second tEUR token
			version: 'v2',
			address: '0xfdb84a3aceaa00ae4d605ae707f3d936744e1f16',
			pairIndex: 0,
			base: '0x20C00000000000000000000021c2be7d74fe9676',
			quote: '0x20C0000000000000000000000000000000000000',
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

/** The listed v2 pair a venue address and pair index name on the chain. */
export function findPropAmmV2Pair(
	chainId: number | undefined,
	address: string,
	pairIndex: number,
): { base: Address; quote: Address } | undefined {
	if (chainId === undefined) return undefined
	for (const pool of propAmmPools[chainId] ?? [])
		if (
			pool.version === 'v2' &&
			pool.pairIndex === pairIndex &&
			pool.address.toLowerCase() === address.toLowerCase() &&
			pool.base &&
			pool.quote
		)
			return { base: pool.base, quote: pool.quote }
	return undefined
}

export const propAmmPostedSelector = toEventSelector(
	propAmmEventsAbi[2],
).toLowerCase()

/** One level of a v2 shape side: a size in size units, a spread in 0.1 bp. */
export type PropAmmShapeLevel = { size: number; spread: number }

/** A v2 pair's ladder (ShapeWord.sol) and the base units each size unit holds. */
export type PropAmmShape = {
	bids: PropAmmShapeLevel[]
	asks: PropAmmShapeLevel[]
	sizeUnit: bigint
}

/** A shape side's levels from its two words, up to its first empty level. */
export function decodeShapeSide(w0: bigint, w1: bigint): PropAmmShapeLevel[] {
	const levels: PropAmmShapeLevel[] = []
	for (let i = 0; i < 10; i++) {
		const word = i < 5 ? w0 : w1
		const shift = BigInt(48 * (i % 5))
		const size = Number((word >> shift) & 0xffffffffn)
		if (size === 0) break
		levels.push({ size, spread: Number((word >> (shift + 32n)) & 0xffffn) })
	}
	return levels
}

const propAmmPairEventSelectors = new Set([
	toEventSelector(propAmmEventsAbi[2]).toLowerCase(),
	toEventSelector(propAmmEventsAbi[3]).toLowerCase(),
])

/**
 * The tokens of the listed v2 pairs that `Posted` and `Refilled` logs name.
 * Those events come from the venue, not the tokens, so token metadata lookups
 * built from log addresses would miss them.
 */
export function propAmmPairTokens(
	chainId: number | undefined,
	logs: readonly { address: string; topics: readonly (string | null)[] }[],
): Address[] {
	const tokens: Address[] = []
	for (const log of logs) {
		const [selector, pairTopic] = log.topics
		if (!selector || !pairTopic) continue
		if (!propAmmPairEventSelectors.has(selector.toLowerCase())) continue
		const pair = findPropAmmV2Pair(
			chainId,
			log.address,
			Number(BigInt(pairTopic)),
		)
		if (pair) tokens.push(pair.base, pair.quote)
	}
	return tokens
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
	base: DexPoolToken
	quote: DexPoolToken
	/** Quote per base: the v2 posted mid or the v1 oracle price. */
	price: number | null
	state: PropAmmState
	/** Null when the balance couldn't be read. */
	baseBalance: number | null
	quoteBalance: number | null
	/** Base and quote held, in US dollars; null when unknown or neither side is a USD token. */
	baseValue: number | null
	quoteValue: number | null
	/** baseValue plus quoteValue. A v2 venue's balances back all of its pairs. */
	inventory: number | null
}

/** A pool with its volume: null while unknown, when trades are loading or unavailable. */
export type PropAmmRow = PropAmmPool & {
	volume: { day: number; month: number } | null
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
	quoteAmount: number
	/** In US dollars, from the pool's USD side; null when neither side is USD. */
	value: number | null
}

export type PropAmmSnapshot = {
	generatedAt: number
	/** Every configured pool and balance was read. */
	complete: boolean
	pools: PropAmmPool[]
}

/** Trades load on their own, so a slow indexer never holds up the pools. */
export type PropAmmTradesSnapshot = {
	generatedAt: number
	/** 1D and 30D totals by pool key; a pool without trades has none. */
	totals: Record<string, PropAmmTotals>
	/** The latest trades, newest first. */
	trades: PropAmmTrade[]
}

/** A v2 hot word's fields (propAMM contracts/src/v2/libraries/HotWord.sol). */
/**
 * A v2 hot word (tempoxyz/propAMM contracts/src/v2/libraries/HotWord.sol),
 * packed least-significant bit first: mid (quote per 1 base, 18 dp), the bid
 * and ask widens (0.1 bp), the width and depth scales (1/1000), the shape,
 * validUntil (unix seconds), seq and flags.
 */
export function decodeHotWord(word: bigint): {
	mid: bigint
	bidWiden: number
	askWiden: number
	widthScale: number
	depthScale: number
	shapeId: number
	validUntil: number
	seq: number
	bidsOff: boolean
	asksOff: boolean
} {
	const bits = (offset: bigint, size: bigint) =>
		Number((word >> offset) & ((1n << size) - 1n))
	const flags = bits(240n, 16n)
	return {
		mid: word & ((1n << 96n) - 1n),
		bidWiden: bits(96n, 16n),
		askWiden: bits(112n, 16n),
		widthScale: bits(128n, 16n),
		depthScale: bits(144n, 16n),
		shapeId: bits(160n, 8n),
		validUntil: bits(168n, 40n),
		seq: bits(208n, 32n),
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

export const propAmmSorts = ['inventory', 'day', 'month'] as const
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

function sortValue(pool: PropAmmRow, sort: PropAmmSort): number {
	switch (sort) {
		case 'inventory':
			return pool.inventory ?? -1
		case 'day':
			return pool.volume?.day ?? -1
		case 'month':
			return pool.volume?.month ?? -1
	}
}

export function sortPropAmmPools(
	pools: readonly PropAmmRow[],
	sort: PropAmmSort,
	dir: 'asc' | 'desc',
): PropAmmRow[] {
	const sign = dir === 'asc' ? 1 : -1
	return [...pools].sort(
		(a, b) =>
			sign * (sortValue(a, sort) - sortValue(b, sort)) ||
			a.base.symbol.localeCompare(b.base.symbol),
	)
}
