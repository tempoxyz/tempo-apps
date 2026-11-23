/**
 * TPV (Total Payment Volume) and AOP (Assets on Platform), read from the
 * chain as Tempo's data warehouse defines them:
 *
 * - TPV: every transfer of an in-scope stablecoin, gross, minus mint and
 *   burn legs (either endpoint is the zero address).
 * - AOP: the end-of-day supply of the assets held on Tempo, split into
 *   stablecoins, tokenized assets (RWAs) and crypto.
 *
 * Amounts are USD: dollar stablecoins at par, other currencies at the latest
 * reference FX rate, and tokenized assets and crypto at their latest market
 * price. Days are UTC.
 */

/** What kind of asset a token is, as AOP splits it. */
export type AssetClass = 'stablecoin' | 'rwa' | 'crypto'

export const assetClasses = ['stablecoin', 'rwa', 'crypto'] as const

/** A token counted on the Payments page. */
export type PaymentToken = {
	address: `0x${string}`
	symbol: string
	/**
	 * Key of the token's USD price: an ISO currency for fiat-backed tokens (USD
	 * counts at par), otherwise the asset's market price ID.
	 */
	price: string
	/** The AOP series the token counts toward. */
	asset: AssetClass
	/** Counts toward TPV. */
	tpv: boolean
}

function usd(address: `0x${string}`, symbol: string): PaymentToken {
	return { address, symbol, price: 'USD', asset: 'stablecoin', tpv: true }
}

function fiat(
	address: `0x${string}`,
	symbol: string,
	currency: string,
): PaymentToken {
	return { address, symbol, price: currency, asset: 'stablecoin', tpv: true }
}

/** Held on Tempo and counted in AOP, but not payment volume. */
function held(
	address: `0x${string}`,
	symbol: string,
	asset: AssetClass,
	price: string,
): PaymentToken {
	return { address, symbol, price, asset, tpv: false }
}

/** Tokens in scope per chain, from dataland's token_pegs seed. */
export const paymentTokens: Partial<Record<number, readonly PaymentToken[]>> = {
	4217: [
		usd('0x20c0000000000000000000000000000000000000', 'pathUSD'),
		usd('0x20c000000000000000000000b9537d11c60e8b50', 'USDC.e'),
		usd('0x20c00000000000000000000014f22ca97301eb73', 'USDT0'),
		usd('0x20c0000000000000000000003554d28269e0f3c2', 'frxUSD'),
		usd('0x20c0000000000000000000000520792dcccccccc', 'cUSD'),
		usd('0x20c0000000000000000000005c0bac7cef389a11', 'GUSD'),
		usd('0x20c0000000000000000000007f7ba549dd0251b9', 'rUSD'),
		usd('0x20c000000000000000000000383a23bacb546ab9', 'reUSD'),
		usd('0x20c000000000000000000000ab02d39df30bd17e', 'iUSD'),
		usd('0x20c0000000000000000000002f52d5cc21a3207b', 'USDe'),
		usd('0x20c000000000000000000000ae247a1130450f09', 'SBC'),
		usd('0x20c0000000000000000000003158081efd85bfc2', 'USDB'),
		usd('0x20c000000000000000000000111111111e910f0f', 'USD1'),
		usd('0x20c0000000000000000000006fd9a167923ba194', 'DLUSD'),
		usd('0x20c000000000000000000000301ecc78ead01357', 'USDS'),
		usd('0x20c0000000000000000000006a37da5c996874be', 'OUSD'),
		usd('0x20c000000000000000000000087f9a1275dc0e7b', 'KUSD'),
		usd('0x20c00000000000000000000030fdd4a919e93fcf', 'wYLDS'),
		usd('0x20c0000000000000000000006d194f9810e6f886', 'goUSD'),
		usd('0x20c0000000000000000000003337951a5a9d94b2', 'YLDS'),
		fiat('0x20c0000000000000000000001621e21f71cf12fb', 'EURC.e', 'EUR'),
		fiat('0x20c0000000000000000000009a4a4b17e0dc6651', 'EURAU', 'EUR'),
		fiat('0x20c00000000000000000000042109aef2f8b28e1', 'CHFAU', 'CHF'),
		fiat('0x20c000000000000000000000f047dd7018e50367', 'BRLA', 'BRL'),
		fiat('0x20c0000000000000000000009bf0d22be57c9f67', 'BRZ', 'BRL'),
		fiat('0x20c000000000000000000000f4371867ae9754ce', 'BRLV', 'BRL'),
		fiat('0x20c0000000000000000000000a6da882d075a4c3', 'GBPA', 'GBP'),
		fiat('0x20c000000000000000000000d65b4808c85dbb81', 'CADD', 'CAD'),
		fiat('0x20c0000000000000000000002e2829d90e7da7fa', 'SEKAU', 'SEK'),
		// A tokenized fund pinned at $1, which also counts as payment volume.
		{
			address: '0xb5ff12bd8010baef823d1bfa2ce6bdc0109cbb24',
			symbol: 'BUIDL',
			price: 'USD',
			asset: 'rwa',
			tpv: true,
		},
		held(
			'0x20c00000000000000000000058d0b8b2cfdb358c',
			'PRIME',
			'rwa',
			'hastra-prime',
		),
		held(
			'0x20c000000000000000000000d479b9f6ec0ceff9',
			'USDY',
			'rwa',
			'ondo-us-dollar-yield',
		),
		held(
			'0x20c0000000000000000000008191667423f70e67',
			'syrupUSDC',
			'rwa',
			'syrupusdc',
		),
		held(
			'0x20c000000000000000000000bd95bfb69fbe6ce3',
			'sUSDe',
			'rwa',
			'ethena-staked-usde',
		),
		held(
			'0x20c000000000000000000000c412ec89d0c08be5',
			'cbBTC',
			'crypto',
			'bitcoin',
		),
	],
}

/** Every token here has 6 decimals. */
export const PAYMENT_TOKEN_DECIMALS = 6

/** One UTC day of a token's transfers, in base units. */
export type TokenDay = {
	day: string
	token: string
	minted: bigint
	burned: bigint
	moved: bigint
}

/** One UTC day of the chain, in USD. */
export type PaymentsDay = {
	/** YYYY-MM-DD, UTC. */
	day: string
	tpv: number
	/** End-of-day AOP of each asset class. */
	stablecoin: number
	rwa: number
	crypto: number
}

/** A day's AOP across every asset class. */
export function aopOf(day: PaymentsDay): number {
	return day.stablecoin + day.rwa + day.crypto
}

export type PaymentsSnapshot = {
	/** Every day from the first transfer through today, oldest first. */
	days: PaymentsDay[]
	/** When the snapshot was read, in ms. */
	asOf: number
	/** Date of the FX rates used for non-USD tokens, or null without them. */
	fxDate: string | null
	/** Price keys left out because no price was available. */
	unpriced: string[]
}

/** USD per one unit of each price key, USD included at 1. */
export type UsdRates = Record<string, number>

const UNIT = 10n ** BigInt(PAYMENT_TOKEN_DECIMALS)

/** Base units to whole tokens, exact to the cent at any size. */
export function units(value: bigint): number {
	const negative = value < 0n
	const abs = negative ? -value : value
	const whole = Number(abs / UNIT) + Number(abs % UNIT) / Number(UNIT)
	return negative ? -whole : whole
}

/**
 * Turns per-token daily transfers into the chain's daily TPV and AOP. Supply
 * carries over days without transfers, so each day's AOP is its closing
 * stock. Tokens without a price are left out.
 */
export function buildPaymentsDays(
	rows: readonly TokenDay[],
	tokens: readonly PaymentToken[],
	rates: UsdRates,
	through: string,
): PaymentsDay[] {
	const byToken = new Map<string, PaymentToken>(
		tokens.map((token) => [token.address, token]),
	)
	const perDay = new Map<string, TokenDay[]>()
	for (const row of rows) {
		const list = perDay.get(row.day)
		if (list) list.push(row)
		else perDay.set(row.day, [row])
	}
	const first = [...perDay.keys()].sort()[0]
	if (!first) return []

	const supply = new Map<PaymentToken, bigint>()
	const days: PaymentsDay[] = []
	for (const day of dayRange(first, through)) {
		let tpv = 0
		for (const row of perDay.get(day) ?? []) {
			const token = byToken.get(row.token)
			if (!token) continue
			supply.set(token, (supply.get(token) ?? 0n) + row.minted - row.burned)
			const rate = rates[token.price]
			if (token.tpv && rate !== undefined) tpv += units(row.moved) * rate
		}
		const entry: PaymentsDay = { day, tpv, stablecoin: 0, rwa: 0, crypto: 0 }
		for (const [token, amount] of supply) {
			const rate = rates[token.price]
			if (rate !== undefined) entry[token.asset] += units(amount) * rate
		}
		days.push(entry)
	}
	return days
}

const DAY = 86_400_000

export function isoDay(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10)
}

/** Each YYYY-MM-DD from from through to, inclusive, in UTC. */
export function dayRange(from: string, to: string): string[] {
	const days: string[] = []
	const end = Date.parse(`${to}T00:00:00Z`)
	for (let at = Date.parse(`${from}T00:00:00Z`); at <= end; at += DAY)
		days.push(isoDay(at))
	return days
}

export type PaymentsTotals = {
	/** TPV of the last full UTC day. */
	day: number
	/** TPV of the last 7 full UTC days. */
	week: number
	/** TPV of every day, today so far included. */
	lifetime: number
	/** AOP at the close of the last full UTC day. */
	aop: number
	/** The last full UTC day. */
	closed: string | null
}

/**
 * Headline numbers. Daily and weekly TPV and AOP use full UTC days only, so
 * they hold still through the day and match the warehouse's figures.
 */
export function paymentsTotals(
	days: readonly PaymentsDay[],
	today: string,
): PaymentsTotals {
	const closed = days.filter((entry) => entry.day < today)
	const last = closed.at(-1)
	return {
		day: last?.tpv ?? 0,
		week: closed.slice(-7).reduce((sum, entry) => sum + entry.tpv, 0),
		lifetime: days.reduce((sum, entry) => sum + entry.tpv, 0),
		aop: last ? aopOf(last) : 0,
		closed: last?.day ?? null,
	}
}

export type Period = 'day' | 'week' | 'month'

/** One UTC day, Monday-to-Sunday week or calendar month. */
export type PaymentsPeriod = {
	/** YYYY-MM-DD of the period's first day. */
	start: string
	/** TPV over the period's days. */
	tpv: number
	/** AOP at the close of the period's last day. */
	stablecoin: number
	rwa: number
	crypto: number
}

/** Groups days into periods: TPV summed, AOP at each period's last day. */
export function periods(
	days: readonly PaymentsDay[],
	period: Period,
): PaymentsPeriod[] {
	const out: PaymentsPeriod[] = []
	for (const entry of days) {
		const start = startOf(entry.day, period)
		const last = out.at(-1)
		if (last?.start === start) {
			last.tpv += entry.tpv
			last.stablecoin = entry.stablecoin
			last.rwa = entry.rwa
			last.crypto = entry.crypto
		} else
			out.push({
				start,
				tpv: entry.tpv,
				stablecoin: entry.stablecoin,
				rwa: entry.rwa,
				crypto: entry.crypto,
			})
	}
	return out
}

function startOf(day: string, period: Period): string {
	if (period === 'week') return mondayOf(day)
	if (period === 'month') return `${day.slice(0, 7)}-01`
	return day
}

function mondayOf(day: string): string {
	const at = Date.parse(`${day}T00:00:00Z`)
	const weekday = (new Date(at).getUTCDay() + 6) % 7
	return isoDay(at - weekday * DAY)
}
