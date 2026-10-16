import { createServerFn } from '@tanstack/react-start'
import { type Address, formatUnits, type Hex } from 'viem'
import { Tick } from 'viem/tempo'
import {
	append,
	bookStatus,
	type DexPool,
	type DexPoolsSnapshot,
	type DexPoolToken,
	type DexPoolVolume,
	emptyVolume,
	originalQuote,
	sideValue,
	tickPrice,
	volumeForBook,
	volumeIntervals,
} from '#lib/dex-pools'
import {
	addressOf,
	dex,
	indexer,
	list,
	type Row,
	readContracts,
	readQuoteSwitches,
	readTokens,
	readVerified,
	sqlTime,
} from '#lib/server/dex-indexer'
import { withDeadline } from '#lib/server/dex-route'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { getBatchedClient, getTempoChain } from '#wagmi.config'

/**
 * Pairs are discovered from the indexer rather than listed exhaustively:
 * every TIP-20 can create a pair, so most of the chain's books are empty.
 * The bases with the most DEX-held balance and the most recent volume cover
 * the books worth showing, and every book of those bases is included.
 */
const BASES_BY_BALANCE = 20
const BASES_BY_VOLUME = 20

/**
 * A book whose levels hold long order queues can take longer to read than
 * the page should wait; it is shown as unreadable instead of failing the page.
 */
const DEPTH_DEADLINE = 6_000

const hexKey = /^0x[0-9a-f]{64}$/

function volumeColumns(windows: { day: string }) {
	return `toString(sumIf(quote_volume, bucket >= '${windows.day}')) AS day,
		toString(sum(quote_volume)) AS month`
}

type RawVolume = { day: bigint; month: bigint }

function volumesByToken(rows: Row[]): Map<Address, RawVolume> {
	const volumes = new Map<Address, RawVolume>()
	for (const row of rows) {
		const token = addressOf(row.token)
		if (!token) continue
		volumes.set(token, {
			day: BigInt(String(row.day)),
			month: BigInt(String(row.month)),
		})
	}
	return volumes
}

/** Fill volume is base-denominated ticks times price, so base decimals apply. */
function toVolume(
	raw: RawVolume | undefined,
	decimals: number,
): DexPoolVolume | undefined {
	if (!raw) return undefined
	return {
		day: Number(formatUnits(raw.day, decimals)),
		month: Number(formatUnits(raw.month, decimals)),
	}
}

export async function getDexPools(): Promise<DexPoolsSnapshot> {
	const chainId = getTempoChain().id
	const client = getBatchedClient()
	const now = Date.now()
	const windows = {
		day: sqlTime(now - 86_400_000),
		month: sqlTime(now - 30 * 86_400_000),
	}

	const [byBalance, byVolume, latest, head, verified] = await Promise.all([
		indexer(
			chainId,
			`SELECT base FROM dex_pair_liquidity WHERE liquidity > 0
			GROUP BY base ORDER BY max(liquidity) DESC LIMIT ${BASES_BY_BALANCE}`,
		),
		indexer(
			chainId,
			`SELECT token FROM dex_ohlc_1m WHERE bucket >= '${windows.month}'
			GROUP BY token ORDER BY sum(quote_volume) DESC LIMIT ${BASES_BY_VOLUME}`,
		),
		client.getBlockNumber(),
		indexer(chainId, 'SELECT max(num) AS head FROM blocks'),
		readVerified(chainId),
	])
	// Depth only reads levels the indexer knows of, so the book is read at a
	// block the indexer has reached rather than the chain head.
	const indexed = Number(head[0]?.head)
	const blockNumber =
		Number.isSafeInteger(indexed) && indexed > 0 && BigInt(indexed) < latest
			? BigInt(indexed)
			: latest
	// Verified tokens are always included, so spam can't crowd them out of
	// the rankings.
	const bases = new Set(
		[
			...verified,
			...byBalance.map((row) => addressOf(row.base)),
			...byVolume.map((row) => addressOf(row.token)),
		]
			.map((base) => addressOf(base))
			.filter((base) => base !== undefined),
	)
	if (bases.size === 0)
		return { blockNumber: String(blockNumber), generatedAt: now, pools: [] }

	const [pairRows, updates, volumeRows] = await Promise.all([
		indexer(
			chainId,
			`SELECT key, base, quote FROM dex_pairs WHERE base IN (${list(bases)})`,
		),
		readQuoteSwitches(chainId, bases),
		indexer(
			chainId,
			`SELECT token, ${volumeColumns(windows)} FROM dex_ohlc_1m
			WHERE bucket >= '${windows.month}' AND token IN (${list(bases)})
			GROUP BY token`,
		),
	])

	const pairs = pairRows.flatMap((row) => {
		const key = String(row.key).toLowerCase()
		const base = addressOf(row.base)
		const quote = addressOf(row.quote)
		if (!hexKey.test(key) || !base || !quote) return []
		return [{ key: key as Hex, base, quote }]
	})

	const tokens = [...new Set(pairs.flatMap((pair) => [pair.base, pair.quote]))]
	const [metadata, books, levelRows] = await Promise.all([
		readTokens(chainId, tokens, blockNumber),
		readContracts(
			pairs.map((pair) => ({
				...dex,
				functionName: 'books' as const,
				args: [pair.key] as const,
			})),
			blockNumber,
		),
		// Orders only rest where they were placed or flip to, so these are the
		// only levels worth reading. Null when unknown, so depth is marked partial.
		indexer(
			chainId,
			`SELECT token, "isBid" AS bid, tick FROM dex_orders
			WHERE token IN (${list(bases)}) GROUP BY token, "isBid", tick
			UNION ALL
			SELECT token, 1 - "isBid" AS bid, "flipTick" AS tick FROM dex_orders
			WHERE token IN (${list(bases)}) AND "isFlipOrder" = 1
			GROUP BY token, "isBid", "flipTick"`,
		).catch((error) => {
			console.error('Failed to read DEX order levels:', error)
			return null
		}),
	])

	const usedTicks = new Map<Address, { bids: Set<number>; asks: Set<number> }>()
	for (const row of levelRows ?? []) {
		const base = addressOf(row.token)
		const tick = Number(row.tick)
		if (!base || !Number.isInteger(tick)) continue
		const levels = usedTicks.get(base) ?? { bids: new Set(), asks: new Set() }
		levels[Number(row.bid) === 1 ? 'bids' : 'asks'].add(tick)
		usedTicks.set(base, levels)
	}

	const totals = volumesByToken(volumeRows)
	const valid = (tick: number) => tick >= Tick.minTick && tick <= Tick.maxTick
	const entries = pairs.flatMap((pair, index) => {
		const base = metadata.get(pair.base)
		const quote = metadata.get(pair.quote)
		const book = books[index]
		if (!base || !quote || book?.status !== 'success') return []
		// A book that was never created reads back as zeros.
		if (/^0x0{40}$/i.test(book.result.base)) return []
		return [{ pair, base, quote, book: book.result }]
	})
	// Only books that exist onchain can have held a base's earlier fills.
	const booksByBase = new Map<Address, Address[]>()
	for (const { pair } of entries) append(booksByBase, pair.base, pair.quote)
	// A base that switched quote tokens inside the window split its fills
	// between books; each stretch between switches is summed separately.
	const intervals = new Map(
		[...updates].flatMap(([base, history]) => {
			const split = volumeIntervals({
				switches: history,
				windowStart: (now - 30 * 86_400_000) / 1000,
				original: originalQuote({
					books: booksByBase.get(base) ?? [],
					switches: history,
					nextQuote: metadata.get(base)?.nextQuoteToken ?? null,
				}),
			})
			return split.length > 1 ? [[base, split] as const] : []
		}),
	)
	const splitReads = Promise.all(
		[...intervals].map(async ([base, split]) => {
			const columns = split.map((interval, index) => {
				const within = [
					interval.from === null
						? null
						: `bucket >= '${sqlTime(interval.from * 1000)}'`,
					interval.to === null
						? null
						: `bucket < '${sqlTime(interval.to * 1000)}'`,
				].filter((condition) => condition !== null)
				const month = within.length
					? `sumIf(quote_volume, ${within.join(' AND ')})`
					: 'sum(quote_volume)'
				const day = `sumIf(quote_volume, ${[...within, `bucket >= '${windows.day}'`].join(' AND ')})`
				return `toString(${day}) AS d${index}, toString(${month}) AS m${index}`
			})
			// One failed split leaves that base's fills on its routed book
			// rather than failing every pair.
			const row = await indexer(
				chainId,
				`SELECT ${columns.join(', ')} FROM dex_ohlc_1m
					WHERE token = '${base}' AND bucket >= '${windows.month}'`,
			).then(
				([row]) => row,
				(error) => {
					console.error('Failed to split DEX volume:', base, error)
					return null
				},
			)
			return [base, split, row] as const
		}),
	)
	// Only the routed book is listed; `getTickLevel` can read no other.
	const [depths, splitRows] = await Promise.all([
		Promise.all(
			entries.map((entry) =>
				bookStatus(entry.pair.quote, entry.base) === 'active'
					? orNull(
							readDepth({
								base: entry.base.token,
								quote: entry.quote.token,
								bestBidTick: entry.book.bestBidTick,
								bestAskTick: entry.book.bestAskTick,
								used: levelRows
									? (usedTicks.get(entry.pair.base) ?? {
											bids: new Set(),
											asks: new Set(),
										})
									: undefined,
								blockNumber,
							}),
							DEPTH_DEADLINE,
						)
					: null,
			),
		),
		splitReads,
	])
	const splits = new Map(
		splitRows
			.flatMap(([base, split, row]) =>
				row ? [[base, split, row] as const] : [],
			)
			.map(([base, split, row]) => [
				base,
				split.map((interval, index) => ({
					quote: interval.quote,
					raw: {
						day: BigInt(String(row?.[`d${index}`] ?? 0)),
						month: BigInt(String(row?.[`m${index}`] ?? 0)),
					},
				})),
			]),
	)

	const pools = entries.map(({ pair, base, quote, book }, index): DexPool => {
		const status = bookStatus(pair.quote, base)
		return {
			key: pair.key,
			base: base.token,
			quote: quote.token,
			status,
			bid: valid(book.bestBidTick) ? tickPrice(book.bestBidTick) : null,
			ask: valid(book.bestAskTick) ? tickPrice(book.bestAskTick) : null,
			liquidity: depths[index] ?? null,
			volume: volumeForBook({
				quote: pair.quote,
				routedQuote: base.quoteToken,
				intervals: (
					splits.get(pair.base) ?? [{ quote: null, raw: totals.get(pair.base) }]
				).map((interval) => ({
					quote: interval.quote,
					volume: toVolume(interval.raw, base.token.decimals) ?? emptyVolume,
				})),
			}),
		}
	})
	return { blockNumber: String(blockNumber), generatedAt: now, pools }
}

function orNull<T>(read: Promise<T>, ms: number): Promise<T | null> {
	let timer: ReturnType<typeof setTimeout> | undefined
	return Promise.race([
		read,
		new Promise<null>((resolve) => {
			timer = setTimeout(() => resolve(null), ms)
		}),
	]).finally(() => clearTimeout(timer))
}

function toLiquidity(
	bids: bigint,
	asks: bigint,
	tokens: { base: DexPoolToken; quote: DexPoolToken },
	partial: boolean,
): NonNullable<DexPool['liquidity']> {
	const bid = Number(formatUnits(bids, tokens.quote.decimals))
	const ask = Number(formatUnits(asks, tokens.base.decimals))
	return { bid, ask, total: bid + ask, partial }
}

/**
 * Sums the routed book's levels from each side's best price outward.
 * `getTickLevel` resolves the base's routed book, so only active books can
 * be read this way. Without the used-tick list only the best levels are
 * read and the total is marked partial.
 */
async function readDepth(input: {
	base: DexPoolToken
	quote: DexPoolToken
	bestBidTick: number
	bestAskTick: number
	used: { bids: Set<number>; asks: Set<number> } | undefined
	blockNumber: bigint
}): Promise<NonNullable<DexPool['liquidity']>> {
	const valid = (tick: number) => tick >= Tick.minTick && tick <= Tick.maxTick
	// The best bid is the highest resting bid and the best ask the lowest ask.
	const bids = valid(input.bestBidTick)
		? [...new Set([input.bestBidTick, ...(input.used?.bids ?? [])])].filter(
				(tick) => valid(tick) && tick <= input.bestBidTick,
			)
		: []
	const asks = valid(input.bestAskTick)
		? [...new Set([input.bestAskTick, ...(input.used?.asks ?? [])])].filter(
				(tick) => valid(tick) && tick >= input.bestAskTick,
			)
		: []
	const levels = [
		...bids.map((tick) => ({ tick, isBid: true })),
		...asks.map((tick) => ({ tick, isBid: false })),
	]
	const results = await readContracts(
		levels.map(({ tick, isBid }) => ({
			...dex,
			functionName: 'getTickLevel' as const,
			args: [input.base.address, tick, isBid] as const,
		})),
		input.blockNumber,
	)
	const read = levels.flatMap((level, index) => {
		const result = results[index]
		return result?.status === 'success'
			? [{ ...level, liquidity: result.result[2] }]
			: []
	})
	const options = {
		baseDecimals: input.base.decimals,
		quoteDecimals: input.quote.decimals,
	}
	return toLiquidity(
		sideValue(
			read.filter((level) => level.isBid),
			{ ...options, isBid: true },
		),
		sideValue(
			read.filter((level) => !level.isBid),
			{ ...options, isBid: false },
		),
		input,
		read.length < levels.length || !input.used,
	)
}

export const fetchDexPools = createServerFn({ method: 'GET' }).handler(
	async (): Promise<DexPoolsSnapshot> => {
		try {
			return await withImmutableDataCache({
				key: `dex-pools:v1:${getTempoChain().id}`,
				ttlSeconds: 30,
				load: () => withDeadline(getDexPools()),
				// Partial snapshots are cached too: re-reading a book that just
				// timed out would only add load until the short TTL expires.
				shouldCache: (snapshot) => snapshot.pools.length > 0,
			})
		} catch (error) {
			console.error('Failed to load Stablecoin DEX pairs:', error)
			throw new Error(
				'Stablecoin DEX pairs are temporarily unavailable. Please try again.',
			)
		}
	},
)
