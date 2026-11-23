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

const inflight = new Map<string, Promise<Entry<unknown>>>()

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
	isFresh: (entry: Entry<T>) => boolean
	load: (previous: T | undefined) => Promise<T>
}): Promise<Entry<T>> {
	const { key, isFresh, load } = options
	const cached = await readEntry<T>(key)
	if (cached && isFresh(cached)) return cached

	let refresh = inflight.get(key) as Promise<Entry<T>> | undefined
	if (!refresh) {
		refresh = load(cached?.data).then(async (data) => {
			const entry = { data, storedAt: Date.now() }
			await writeEntry(key, entry)
			return entry
		})
		const shared = refresh.finally(() => inflight.delete(key))
		inflight.set(key, shared as Promise<Entry<unknown>>)
		refresh = shared
	}
	if (!cached) return refresh
	inBackground(
		refresh.catch((error) =>
			console.error(`Payments refresh failed (${key}):`, error),
		),
	)
	return cached
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

/** USD price of each market-priced asset. Throws when unavailable. */
async function readMarketPrices(ids: readonly string[]): Promise<UsdRates> {
	if (ids.length === 0) return {}
	const response = await fetch(`${MARKET_URL}&ids=${ids.join(',')}`, {
		headers: { Accept: 'application/json' },
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

// ---------------------------------------------------------------------------
// The snapshot.

function nextDay(day: string): string {
	return isoDay(Date.parse(`${day}T00:00:00Z`) + DAY)
}

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
		// Past days never change: append the days since the cached copy.
		swr<History>({
			key: `history:v2:${chainId}`,
			isFresh: (entry) => entry.data.through >= yesterday,
			load: async (previous) => {
				const from = previous ? nextDay(previous.through) : undefined
				const rows = await readTokenDays(chainId, tokens, from, today)
				return {
					through: yesterday,
					rows: previous ? [...previous.rows, ...rows] : rows,
				}
			},
		}),
		swr<Today>({
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
			key: `fx:v2:${currencies.join(',')}`,
			isFresh: (entry) => now - entry.storedAt < FX_FRESH,
			load: () => readFxRates(currencies),
		}).catch((error) => {
			console.error('Failed to load FX rates:', error)
			return undefined
		}),
		swr({
			key: `market:v2:${assets.join(',')}`,
			isFresh: (entry) => now - entry.storedAt < MARKET_FRESH,
			load: () => readMarketPrices(assets),
		}).catch((error) => {
			console.error('Failed to load market prices:', error)
			return undefined
		}),
	])

	// A stale "today" from an earlier day is already in history.
	const todayRows = current?.data.day === today ? current : undefined
	const version = [
		chainId,
		today,
		history.storedAt,
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
		through: history.data.through,
	}
	built = { version, snapshot }
	return snapshot
}
