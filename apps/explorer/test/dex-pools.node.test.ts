import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address } from 'viem'
import { Addresses } from 'viem/tempo'
import {
	bookStatus,
	type DexPool,
	dexPoolsSearchSchema,
	matchesPoolQuery,
	originalQuote,
	sideValue,
	sortPools,
	spreadBps,
	volumeForBook,
	volumeIntervals,
} from '#lib/dex-pools'
import { getDexPools } from '#lib/server/dex-pools'

const { query, multicall } = vi.hoisted(() => ({
	query: vi.fn(),
	multicall: vi.fn(),
}))
vi.mock('#lib/server/env', () => ({
	tempoApi: { url: 'https://api.test', headers: undefined },
	tempoApiUrl: 'https://api.test',
}))
vi.mock('#lib/server/network', () => ({ getChainBackend: () => undefined }))
vi.mock('#lib/server/verified-tokens', () => ({
	getVerifiedTokenAddresses: async () =>
		new Set([USDT, OUSD, Addresses.pathUsd]),
}))
vi.mock('#wagmi.config', () => ({
	getTempoChain: () => ({ id: 4217 }),
	getBatchedClient: () => ({ getBlockNumber: async () => 100n, multicall }),
}))

const USDT = '0x20c00000000000000000000014f22ca97301eb73'
const OUSD = '0x20c0000000000000000000006a37da5c996874be'
const PATH = Addresses.pathUsd
const USDC = '0x20c000000000000000000000b9537d11c60e8b50'
const ACTIVE = `0x${'a'.repeat(64)}` as const
const RETIRED = `0x${'b'.repeat(64)}` as const
const MISSING = `0x${'c'.repeat(64)}` as const
const SWITCH_AT = Math.floor(Date.now() / 1000) - 10 * 86_400

function rows(columns: string[], values: unknown[][]) {
	return new Response(JSON.stringify({ ok: true, columns, rows: values }), {
		headers: { 'content-type': 'application/json' },
	})
}

type Contract = {
	address: Address
	functionName: string
	args?: readonly unknown[]
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.stubGlobal('fetch', async (url: URL) =>
		query(new URL(url).searchParams.get('sql') ?? ''),
	)
	query.mockImplementation(async (sql: string) => {
		// The indexer is one block behind the RPC's 100.
		if (sql.includes('FROM blocks')) return rows(['head'], [[99]])
		if (sql.includes('FROM dex_pair_liquidity')) return rows(['base'], [[USDT]])
		if (sql.includes('FROM dex_pairs'))
			return rows(
				['key', 'base', 'quote'],
				[
					[RETIRED, USDT, PATH],
					[ACTIVE, USDT, OUSD],
					// Indexed, but never created onchain.
					[MISSING, USDT, USDC],
				],
			)
		if (sql.includes('topic2'))
			return rows(
				['address', 'topic2', 'ts'],
				[[USDT, `0x${'0'.repeat(24)}${OUSD.slice(2)}`, SWITCH_AT]],
			)
		if (sql.includes('UNION ALL'))
			return rows(
				['token', 'bid', 'tick'],
				[
					[USDT, 1, -10],
					[USDT, 1, -20],
					// Above the best bid, so it cannot hold a resting bid.
					[USDT, 1, 30],
					[USDT, 0, 10],
				],
			)
		// One split, so fills before it went to the pathUSD book.
		if (sql.includes('AS d0'))
			return rows(
				['d0', 'm0', 'd1', 'm1'],
				[['1000000', '1000000', '0', '4000000']],
			)
		if (sql.includes('FROM dex_ohlc_1m') && sql.includes('token IN'))
			return rows(['token', 'day', 'month'], [[USDT, '1000000', '5000000']])
		if (sql.includes('FROM dex_ohlc_1m')) return rows(['token'], [[USDT]])
		throw new Error(`Unexpected query: ${sql}`)
	})
	multicall.mockImplementation(async ({ contracts }) =>
		contracts.map(({ address, functionName, args = [] }: Contract) => {
			const success = (result: unknown) => ({ status: 'success', result })
			if (functionName === 'symbol')
				return success(
					address === USDT ? 'USDT0' : address === OUSD ? 'OUSD' : 'pathUSD',
				)
			if (functionName === 'decimals') return success(6)
			if (functionName === 'quoteToken' || functionName === 'nextQuoteToken')
				return success(address === USDT ? OUSD : PATH)
			if (functionName === 'books')
				return success(
					args[0] === ACTIVE
						? { base: USDT, quote: OUSD, bestBidTick: -10, bestAskTick: 10 }
						: args[0] === MISSING
							? {
									base: `0x${'0'.repeat(40)}`,
									quote: `0x${'0'.repeat(40)}`,
									bestBidTick: 0,
									bestAskTick: 0,
								}
							: { base: USDT, quote: PATH, bestBidTick: -50, bestAskTick: -30 },
				)
			if (functionName === 'getTickLevel') {
				const [, tick, isBid] = args as [Address, number, boolean]
				const size = !isBid
					? 20_000_000n
					: tick === -10
						? 100_000_000n
						: 50_000_000n
				return success([1n, 1n, size])
			}
			throw new Error(`Unexpected read: ${functionName}`)
		}),
	)
})

describe('Stablecoin DEX pairs', () => {
	it('classifies books against the base token’s quote tokens', () => {
		const base = {
			quoteToken: OUSD as Address,
			nextQuoteToken: OUSD as Address,
		}
		expect(bookStatus(OUSD, base)).toBe('active')
		expect(bookStatus(PATH, base)).toBe('retired')
		expect(bookStatus(OUSD, { quoteToken: PATH, nextQuoteToken: OUSD })).toBe(
			'place-only',
		)
	})

	it('splits volume at every quote switch in the window', () => {
		// Newest first: USDT moved PATH -> USDC -> OUSD, both inside the window.
		const switches = [
			{ quote: OUSD as Address, at: 300 },
			{ quote: USDC as Address, at: 200 },
		]
		const intervals = volumeIntervals({
			switches,
			windowStart: 100,
			original: PATH,
		})
		expect(intervals).toEqual([
			{ from: 300, to: null, quote: OUSD },
			{ from: 200, to: 300, quote: USDC },
			{ from: null, to: 200, quote: PATH },
		])
		const volumes = intervals.map((interval, index) => ({
			quote: interval.quote,
			volume: { day: 0, month: [5, 3, 2][index] ?? 0 },
		}))
		const book = (quote: Address) =>
			volumeForBook({ quote, routedQuote: OUSD, intervals: volumes }).month
		expect([book(OUSD), book(USDC), book(PATH)]).toEqual([5, 3, 2])
		// A stretch with an unknown quote stays with the routed book.
		expect(
			volumeForBook({
				quote: OUSD,
				routedQuote: OUSD,
				intervals: [...volumes.slice(0, 2), { ...volumes[2], quote: null }],
			}).month,
		).toBe(7)
		expect(
			volumeIntervals({ switches, windowStart: 400, original: PATH }),
		).toEqual([{ from: null, to: null, quote: null }])
	})

	it('finds the quote a base had before its first switch', () => {
		const once = [{ quote: OUSD as Address }]
		expect(
			originalQuote({ books: [PATH, OUSD], switches: once, nextQuote: OUSD }),
		).toBe(PATH)
		// A staged next quote's book is not an earlier one.
		expect(
			originalQuote({
				books: [PATH, OUSD, USDC],
				switches: once,
				nextQuote: USDC,
			}),
		).toBe(PATH)
		// PATH -> OUSD -> PATH: the token returned to its original quote.
		const back = [{ quote: PATH as Address }, { quote: OUSD as Address }]
		expect(
			originalQuote({ books: [PATH, OUSD], switches: back, nextQuote: PATH }),
		).toBe(PATH)
		expect(
			originalQuote({
				books: [PATH, USDT, OUSD],
				switches: once,
				nextQuote: OUSD,
			}),
		).toBeNull()
	})

	it('values bids at their tick price in quote decimals', () => {
		expect(
			sideValue([{ tick: -100, liquidity: 1_000_000n }], {
				isBid: true,
				baseDecimals: 6,
				quoteDecimals: 18,
			}),
		).toBe(999_000_000_000_000_000n)
		expect(
			sideValue([{ tick: 50, liquidity: 7n }], {
				isBid: false,
				baseDecimals: 6,
				quoteDecimals: 6,
			}),
		).toBe(7n)
	})

	it('sorts unknown values last and reports spread in bps', () => {
		const pool = (total: number | null) =>
			({
				liquidity: total === null ? null : { total },
				volume: { day: 0 },
			}) as DexPool
		const sorted = sortPools([pool(null), pool(1), pool(3)], 'liquidity', 'asc')
		expect(sorted.map((entry) => entry.liquidity?.total ?? null)).toEqual([
			1,
			3,
			null,
		])
		const unreadable = {
			liquidity: { total: 0, partial: true },
			volume: { day: 0 },
		} as DexPool
		expect(sortPools([unreadable, pool(2)], 'liquidity', 'asc')[0]).not.toBe(
			unreadable,
		)
		expect(spreadBps(0.9999, 1.0001)).toBeCloseTo(2)
		expect(spreadBps(null, 1)).toBeNull()
	})

	it('defaults search params and matches symbols or exact addresses', () => {
		expect(dexPoolsSearchSchema.parse({})).toEqual({
			tab: 'pairs',
			sort: 'liquidity',
			dir: 'desc',
			unverified: false,
		})
		const pool = {
			base: { symbol: 'USDT0', address: USDT },
			quote: { symbol: 'OUSD', address: OUSD },
		} as DexPool
		expect(matchesPoolQuery(pool, 'ousd')).toBe(true)
		expect(matchesPoolQuery(pool, USDT.toUpperCase())).toBe(true)
		expect(matchesPoolQuery(pool, USDT.slice(0, 10))).toBe(false)
	})

	it('reads the routed book by tick and splits volume across books', async () => {
		const snapshot = await getDexPools()
		// Book reads are pinned to the block the indexer has reached.
		expect(snapshot.blockNumber).toBe('99')
		// Verified tokens are discovered even outside the rankings.
		expect(
			query.mock.calls.some(
				([sql]) => sql.includes('FROM dex_pairs') && sql.includes(OUSD),
			),
		).toBe(true)
		const active = snapshot.pools.find((pool) => pool.key === ACTIVE)
		const retired = snapshot.pools.find((pool) => pool.key === RETIRED)

		expect(active).toMatchObject({
			status: 'active',
			bid: 0.9999,
			ask: 1.0001,
			// Bids: 100 at 0.9999 + 50 at 0.9998; asks: 20.
			liquidity: { bid: 149.98, ask: 20, partial: false },
			volume: { day: 1, month: 1 },
		})
		expect(
			multicall.mock.calls
				.flatMap(([{ contracts }]) => contracts as Contract[])
				.filter((contract) => contract.functionName === 'getTickLevel')
				.map((contract) => contract.args?.slice(1)),
		).toEqual([
			[-10, true],
			[-20, true],
			[10, false],
		])
		expect(retired).toMatchObject({
			status: 'retired',
			liquidity: null,
			volume: { day: 0, month: 4 },
		})
		expect(snapshot.pools.some((pool) => pool.key === MISSING)).toBe(false)
	})

	it('keeps a base’s volume on its routed book when its split fails', async () => {
		const fallback = query.getMockImplementation()
		query.mockImplementation(async (sql: string) => {
			if (sql.includes('AS d0')) throw new Error('query too large')
			return fallback?.(sql)
		})
		const snapshot = await getDexPools()
		expect(snapshot.pools.find((pool) => pool.key === ACTIVE)?.volume).toEqual({
			day: 1,
			month: 5,
		})
	})
})
