import { createServerFn } from '@tanstack/react-start'
import {
	buildPaymentsDays,
	isoDay,
	type PaymentToken,
	type PaymentsSnapshot,
	paymentTokens,
	type TokenDay,
	type UsdRates,
} from '#lib/payments'
import { indexer, list } from '#lib/server/dex-indexer'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { getTempoChain } from '#wagmi.config'

const TRANSFER_SIGNATURE =
	'Transfer(address indexed from, address indexed to, uint256 amount)'
const ZERO = '0x0000000000000000000000000000000000000000'

/** How long a snapshot is served before the indexer is read again. */
const SNAPSHOT_TTL = 600

/** How long a snapshot without every FX rate is served. */
const DEGRADED_TTL = 60

/** Reference rates (ECB), keyed by the currency, in units per USD. */
const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=USD'

/** Every token's mints, burns and other transfers, per UTC day. */
async function readTokenDays(
	chainId: number,
	tokens: readonly PaymentToken[],
): Promise<TokenDay[]> {
	const rows = await indexer(
		chainId,
		`SELECT toString(toDate(block_timestamp, 'UTC')) AS day, address,
			toString(sumIf(amount, "from" = '${ZERO}' AND "to" != '${ZERO}')) AS minted,
			toString(sumIf(amount, "to" = '${ZERO}' AND "from" != '${ZERO}')) AS burned,
			toString(sumIf(amount, "from" != '${ZERO}' AND "to" != '${ZERO}')) AS moved
		FROM transfer
		WHERE address IN (${list(tokens.map((token) => token.address))})
		GROUP BY day, address`,
		TRANSFER_SIGNATURE,
	)
	return rows.map((row) => ({
		day: String(row.day),
		token: String(row.address).toLowerCase(),
		minted: BigInt(String(row.minted)),
		burned: BigInt(String(row.burned)),
		moved: BigInt(String(row.moved)),
	}))
}

/** USD per unit of each currency; only USD when the rates are unavailable. */
async function readUsdRates(
	currencies: readonly string[],
): Promise<{ rates: UsdRates; date: string | null }> {
	const rates: UsdRates = { USD: 1 }
	const foreign = currencies.filter((currency) => currency !== 'USD')
	if (foreign.length === 0) return { rates, date: null }
	try {
		const response = await fetch(`${FX_URL}&symbols=${foreign.join(',')}`, {
			signal: AbortSignal.timeout(5_000),
		})
		if (!response.ok) throw new Error(`FX rates returned ${response.status}`)
		const body = (await response.json()) as {
			date?: string
			rates?: Record<string, number>
		}
		for (const [currency, perUsd] of Object.entries(body.rates ?? {}))
			if (perUsd > 0) rates[currency] = 1 / perUsd
		return { rates, date: body.date ?? null }
	} catch (error) {
		console.error('Failed to load FX rates:', error)
		return { rates, date: null }
	}
}

export async function getPaymentsSnapshot(
	chainId: number,
	now = Date.now(),
): Promise<PaymentsSnapshot> {
	const tokens = paymentTokens[chainId] ?? []
	if (tokens.length === 0)
		return { days: [], asOf: now, fxDate: null, unpriced: [] }
	const currencies = [...new Set(tokens.map((token) => token.currency))]
	const [rows, fx] = await Promise.all([
		readTokenDays(chainId, tokens),
		readUsdRates(currencies),
	])
	return {
		days: buildPaymentsDays(rows, tokens, fx.rates, isoDay(now)),
		asOf: now,
		fxDate: fx.date,
		unpriced: currencies.filter((currency) => fx.rates[currency] === undefined),
	}
}

export const fetchPayments = createServerFn({ method: 'GET' }).handler(
	async (): Promise<PaymentsSnapshot> => {
		const chainId = getTempoChain().id
		try {
			return await withImmutableDataCache({
				key: `payments:v1:${chainId}`,
				// A snapshot missing a currency is kept briefly, so an FX outage
				// doesn't send every view to the indexer.
				ttlSeconds: (snapshot) =>
					snapshot.unpriced.length > 0 ? DEGRADED_TTL : SNAPSHOT_TTL,
				load: () => getPaymentsSnapshot(chainId),
				shouldCache: (snapshot) => snapshot.days.length > 0,
			})
		} catch (error) {
			console.error('Failed to load payments:', error)
			throw new Error('Payment volume is unavailable right now.')
		}
	},
)
