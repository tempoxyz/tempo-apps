import { waitUntil } from 'cloudflare:workers'
import * as Json from 'ox/Json'
import {
	buildPaymentsDays,
	isoDay,
	type PaymentToken,
	type PaymentsSnapshot,
	paymentTokens,
	type TokenDay,
	type UsdRates,
} from '#lib/payments'
import { indexer, list, sqlTime } from '#lib/server/dex-indexer'

/**
 * Payments data is served from the edge cache and refreshed behind the
 * response (stale-while-revalidate), so a page view never waits on the
 * indexer or a price API once a colo has data, and an upstream outage keeps
 * serving the last good data instead of failing.
 *
 * The indexer is read in two parts, each cached on its own:
 * - history: every full UTC day. Past days never change, so after the first
 *   full read (about 1 s, 300 KB) each new day is appended with a one-day
 *   read (about 250 ms, 1 KB).
 * - today: the current UTC day so far, refreshed every two minutes.
 * FX rates and market prices are cached on their own clocks too.
 */

const TRANSFER_SIGNATURE =
	'Transfer(address indexed from, address indexed to, uint256 amount)'
const ZERO = '0x0000000000000000000000000000000000000000'
const DAY = 86_400_000

/** How long after UTC midnight the indexer may still be finishing the day. */
const SETTLE = 30 * 60_000

/** How long each part is served before a background refresh. */
const TODAY_FRESH = 2 * 60_000
const FX_FRESH = 6 * 60 * 60_000
const MARKET_FRESH = 10 * 60_000

/** How long the edge keeps any part, as the last good copy for outages. */
const HARD_TTL_SECONDS = 7 * 24 * 60 * 60

/** Longest wait on an upstream read when there is nothing cached to serve. */
const INDEXER_DEADLINE = 8_000
const PRICE_DEADLINE = 3_000

/** Reference rates (ECB), keyed by the currency, in units per USD. */
const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=USD'

/** Market prices in USD, keyed by CoinGecko ID. */
const MARKET_URL =
	'https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd'

const ISO_CURRENCY = /^[A-Z]{3}$/

const USER_AGENT = 'tempo-explorer (+https://explore.tempo.xyz)'

/** Spot prices to fall back on per CoinGecko ID, when CoinGecko is down. */
const FALLBACK_SPOT: Record<string, string> = {
	bitcoin: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
}

const CACHE_ORIGIN = 'https://explore.tempo.xyz'

/** A token-day as cached: amounts as decimal strings, since JSON has no bigint. */
type RawTokenDay = {
	day: string
	token: string
	minted: string
	burned: string
	moved: string
}

/** Every full UTC day, through the day named by through. */
type History = { through: string; rows: RawTokenDay[] }

/** The current UTC day so far. */
type Today = { day: string; rows: RawTokenDay[] }

type Entry<T> = { data: T; storedAt: number }

// ---------------------------------------------------------------------------
// Stale-while-revalidate over the Cache API.

const inflight = new Map<
	string,
	{ promise: Promise<Entry<unknown>>; startedAt: number }
>()

/** Longest a refresh may run before another request starts a new one. */
const INFLIGHT_LIMIT = 30_000

function cacheRequest(key: string): Request {
	return new Request(`${CACHE_ORIGIN}/__payments/${encodeURIComponent(key)}`)
}

function edgeCache(): Cache | undefined {
	if (typeof window !== 'undefined' || typeof caches === 'undefined')
		return undefined
	return (caches as unknown as { default: Cache }).default
}

async function readEntry<T>(key: string): Promise<Entry<T> | undefined> {
	const cache = edgeCache()
	if (!cache) return undefined
	try {
		const cached = await cache.match(cacheRequest(key))
		return cached ? (Json.parse(await cached.text()) as Entry<T>) : undefined
	} catch {
		return undefined
	}
}

async function writeEntry<T>(key: string, entry: Entry<T>): Promise<void> {
	const cache = edgeCache()
	if (!cache) return
	try {
		await cache.put(
			cacheRequest(key),
			new Response(Json.stringify(entry), {
				headers: {
					'Cache-Control': `public, max-age=${HARD_TTL_SECONDS}`,
					'Content-Type': 'application/json',
				},
			}),
		)
	} catch {
		// The cache must never make a read fail.
	}
}

/** Keeps a refresh running after the response is sent. */
function inBackground(work: Promise<unknown>): void {
	try {
		waitUntil(work)
	} catch {
		// Outside a request (tests), the promise still runs to its end.
	}
}

/**
 * The cached value when fresh. When stale, the cached value at once, with a
 * refresh behind it. With nothing cached, waits for load. One refresh per
 * key runs at a time in an isolate; a failed refresh keeps the stale value.
 */
async function swr<T>(options: {
	key: string
	/** The request's clock, which stamps a refreshed entry. */
	now: number
	isFresh: (entry: Entry<T>) => boolean
	load: (previous: T | undefined) => Promise<T>
}): Promise<Entry<T>> {
	const { key, now, isFresh, load } = options
	const cached = await readEntry<T>(key)
	if (cached && isFresh(cached)) return cached

	// A refresh older than INFLIGHT_LIMIT is treated as lost (its request
	// may have been cancelled before it settled) and replaced.
	const running = inflight.get(key)
	let refresh =
		running && Date.now() - running.startedAt < INFLIGHT_LIMIT
			? (running.promise as Promise<Entry<T>>)
			: undefined
	if (!refresh) {
		const started = load(cached?.data).then(async (data) => {
			const entry = { data, storedAt: now }
			await writeEntry(key, entry)
			return entry
		})
		const shared = started.finally(() => {
			if (inflight.get(key)?.promise === shared) inflight.delete(key)
		})
		inflight.set(key, { promise: shared, startedAt: Date.now() })
		// Every refresh outlives the request that started it, so a visitor
		// leaving mid-load never strands it.
		inBackground(
			shared.catch((error) =>
				console.error(`Payments refresh failed (${key}):`, error),
			),
		)
		refresh = shared
	}
	return cached ?? refresh
}

function withDeadline<T>(
	read: Promise<T>,
	ms: number,
	what: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	return Promise.race([
		read,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${what} timed out.`)), ms)
		}),
	]).finally(() => clearTimeout(timer))
}

// ---------------------------------------------------------------------------
// Upstream reads.

/** Mints, burns and other transfers per token and UTC day, in [from, to). */
async function readTokenDays(
	chainId: number,
	tokens: readonly PaymentToken[],
	from: string | undefined,
	to: string | undefined,
): Promise<RawTokenDay[]> {
	const range = [
		from
			? `AND block_timestamp >= '${sqlTime(Date.parse(`${from}T00:00:00Z`))}'`
			: '',
		to
			? `AND block_timestamp < '${sqlTime(Date.parse(`${to}T00:00:00Z`))}'`
			: '',
	].join(' ')
	const rows = await withDeadline(
		indexer(
			chainId,
			`SELECT toString(toDate(block_timestamp, 'UTC')) AS day, address,
				toString(sumIf(amount, "from" = '${ZERO}' AND "to" != '${ZERO}')) AS minted,
				toString(sumIf(amount, "to" = '${ZERO}' AND "from" != '${ZERO}')) AS burned,
				toString(sumIf(amount, "from" != '${ZERO}' AND "to" != '${ZERO}')) AS moved
			FROM transfer
			WHERE address IN (${list(tokens.map((token) => token.address))}) ${range}
			GROUP BY day, address`,
			TRANSFER_SIGNATURE,
		),
		INDEXER_DEADLINE,
		'Payments indexer read',
	)
	return rows.map((row) => ({
		day: String(row.day),
		token: String(row.address).toLowerCase(),
		minted: String(row.minted),
		burned: String(row.burned),
		moved: String(row.moved),
	}))
}

/** USD per unit of each fiat currency, USD included. Throws when unavailable. */
async function readFxRates(
	currencies: readonly string[],
): Promise<{ rates: UsdRates; date: string | null }> {
	const rates: UsdRates = { USD: 1 }
	const foreign = currencies.filter((currency) => currency !== 'USD')
	if (foreign.length === 0) return { rates, date: null }
	const response = await fetch(`${FX_URL}&symbols=${foreign.join(',')}`, {
		headers: { 'User-Agent': USER_AGENT },
		signal: AbortSignal.timeout(PRICE_DEADLINE),
	})
	if (!response.ok) throw new Error(`FX rates returned ${response.status}`)
	const body = (await response.json()) as {
		date?: string
		rates?: Record<string, number>
	}
	for (const [currency, perUsd] of Object.entries(body.rates ?? {}))
		if (perUsd > 0) rates[currency] = 1 / perUsd
	return { rates, date: body.date ?? null }
}

/** USD price of each asset from CoinGecko. Throws when unavailable. */
async function readCoinGecko(ids: readonly string[]): Promise<UsdRates> {
	if (ids.length === 0) return {}
	const response = await fetch(`${MARKET_URL}&ids=${ids.join(',')}`, {
		// CoinGecko refuses requests without a User-Agent with 403, and Workers
		// send none by default.
		headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
		signal: AbortSignal.timeout(PRICE_DEADLINE),
	})
	if (!response.ok) throw new Error(`Market prices returned ${response.status}`)
	const body = (await response.json()) as Record<string, { usd?: number }>
	const prices: UsdRates = {}
	for (const id of ids) {
		const price = body[id]?.usd
		if (price !== undefined && price > 0) prices[id] = price
	}
	return prices
}

/** A spot price in USD from Coinbase. */
async function readSpot(url: string): Promise<number> {
	const response = await fetch(url, {
		headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
		signal: AbortSignal.timeout(PRICE_DEADLINE),
	})
	if (!response.ok) throw new Error(`Spot price returned ${response.status}`)
	const body = (await response.json()) as { data?: { amount?: string } }
	const price = Number(body.data?.amount)
	if (!(price > 0)) throw new Error('Spot price missing')
	return price
}

/**
 * USD price of each market-priced asset: CoinGecko, with a spot price for
 * each asset it misses that has one. Throws only when nothing is priced.
 */
async function readMarketPrices(ids: readonly string[]): Promise<UsdRates> {
	const prices = await readCoinGecko(ids).catch((error) => {
		console.error('CoinGecko prices unavailable:', error)
		return {} as UsdRates
	})
	const missing = ids.filter(
		(id) => prices[id] === undefined && FALLBACK_SPOT[id],
	)
	await Promise.all(
		missing.map(async (id) => {
			try {
				prices[id] = await readSpot(FALLBACK_SPOT[id] as string)
			} catch (error) {
				console.error(`Spot price for ${id} unavailable:`, error)
			}
		}),
	)
	if (ids.length > 0 && Object.keys(prices).length === 0)
		throw new Error('Market prices unavailable')
	return prices
}

// ---------------------------------------------------------------------------
// The snapshot.

function toTokenDays(rows: readonly RawTokenDay[]): TokenDay[] {
	return rows.map((row) => ({
		day: row.day,
		token: row.token,
		minted: BigInt(row.minted),
		burned: BigInt(row.burned),
		moved: BigInt(row.moved),
	}))
}

/** The last snapshot built in this isolate, reused while its parts are unchanged. */
let built: { version: string; snapshot: PaymentsSnapshot } | undefined

export async function getPaymentsSnapshot(
	chainId: number,
	now = Date.now(),
): Promise<PaymentsSnapshot> {
	const tokens = paymentTokens[chainId] ?? []
	const today = isoDay(now)
	if (tokens.length === 0)
		return { days: [], asOf: now, fxDate: null, unpriced: [], through: null }
	const yesterday = isoDay(now - DAY)
	const keys = [...new Set(tokens.map((token) => token.price))]
	const currencies = keys.filter((key) => ISO_CURRENCY.test(key))
	const assets = keys.filter((key) => !ISO_CURRENCY.test(key))

	const [history, current, fx, market] = await Promise.all([
		// Past days never change once the indexer has passed them: append the
		// days since the cached copy, re-reading its last day, which the
		// indexer may not have finished when it was read. A copy taken in the
		// first SETTLE after midnight is read again once that has passed.
		swr<History>({
			now,
			key: `history:v3:${chainId}`,
			isFresh: (entry) =>
				entry.data.through >= yesterday &&
				entry.storedAt >= Date.parse(`${today}T00:00:00Z`) + SETTLE,
			load: async (previous) => {
				const from = previous?.through
				const rows = await readTokenDays(chainId, tokens, from, today)
				return {
					through: yesterday,
					rows: previous
						? [
								...previous.rows.filter((row) => row.day < previous.through),
								...rows,
							]
						: rows,
				}
			},
		}),
		swr<Today>({
			now,
			key: `today:v2:${chainId}`,
			isFresh: (entry) =>
				entry.data.day === today && now - entry.storedAt < TODAY_FRESH,
			load: async () => ({
				day: today,
				rows: await readTokenDays(chainId, tokens, today, undefined),
			}),
		}).catch((error) => {
			console.error("Failed to load today's payments:", error)
			return undefined
		}),
		swr({
			now,
			key: `fx:v2:${currencies.join(',')}`,
			isFresh: (entry) => now - entry.storedAt < FX_FRESH,
			load: () => readFxRates(currencies),
		}).catch((error) => {
			console.error('Failed to load FX rates:', error)
			return undefined
		}),
		swr<UsdRates>({
			now,
			key: `market:v2:${assets.join(',')}`,
			isFresh: (entry) => now - entry.storedAt < MARKET_FRESH,
			// A refresh that prices only some assets, such as Coinbase's bitcoin
			// while CoinGecko is down, keeps the last good price of the rest.
			load: async (previous) => ({
				...previous,
				...(await readMarketPrices(assets)),
			}),
		}).catch((error) => {
			console.error('Failed to load market prices:', error)
			return undefined
		}),
	])

	// A cached "today" stays in until history covers its day, such as just
	// after midnight or while the indexer is down across it.
	const todayRows =
		current && current.data.day > history.data.through ? current : undefined
	const version = [
		chainId,
		today,
		history.storedAt,
		todayRows?.data.day,
		todayRows?.storedAt,
		fx?.storedAt,
		market?.storedAt,
	].join('|')
	if (built?.version === version) return { ...built.snapshot, asOf: now }

	const rates: UsdRates = { USD: 1, ...fx?.data.rates, ...market?.data }
	const rows = toTokenDays(
		todayRows
			? [...history.data.rows, ...todayRows.data.rows]
			: history.data.rows,
	)
	const snapshot: PaymentsSnapshot = {
		days: buildPaymentsDays(rows, tokens, rates, today),
		asOf: now,
		fxDate: fx?.data.date ?? null,
		unpriced: keys.filter((key) => rates[key] === undefined),
		// A cached day counts as covered only when its copy was taken at its
		// close; an older copy (the indexer went down during the day) keeps
		// the rows but leaves the day open, so the page still warns.
		through:
			todayRows &&
			todayRows.data.day < today &&
			todayRows.storedAt >=
				Date.parse(`${todayRows.data.day}T00:00:00Z`) + DAY - TODAY_FRESH
				? todayRows.data.day
				: history.data.through,
	}
	built = { version, snapshot }
	return snapshot
}
