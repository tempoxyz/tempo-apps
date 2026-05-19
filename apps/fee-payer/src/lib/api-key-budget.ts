import { env } from 'cloudflare:workers'
import { formatUnits, parseUnits } from 'viem'
import type { ApiKeyRecord } from './api-keys.js'

const MICRODOLLAR_DECIMALS = 6
const ATTODOLLARS_PER_MICRODOLLAR = 10n ** 12n

function attodollarToMicrodollar(attodollars: bigint) {
	return (
		(attodollars + ATTODOLLARS_PER_MICRODOLLAR - 1n) /
		ATTODOLLARS_PER_MICRODOLLAR
	)
}

function dailySpendKvKey(apiKey: string) {
	const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
	return `spend:${apiKey}:${today}`
}

function lifetimeSpendKvKey(apiKey: string) {
	return `spend:${apiKey}:lifetime`
}

/** Read the current daily spend (microdollars) for an API key from KV. */
export async function getDailySpend(apiKey: string): Promise<bigint> {
	const raw = await env.SponsorApiKeyStore!.get(dailySpendKvKey(apiKey))
	if (!raw) return 0n
	return BigInt(raw)
}

/** Read the cumulative lifetime spend (microdollars) for an API key from KV. */
export async function getLifetimeSpend(apiKey: string): Promise<bigint> {
	const raw = await env.SponsorApiKeyStore!.get(lifetimeSpendKvKey(apiKey))
	if (!raw) return 0n
	return BigInt(raw)
}

/** Format a microdollar amount as a USD string (e.g. "1.234567"). */
export function formatMicrodollarUsd(microdollars: bigint): string {
	return formatUnits(microdollars, MICRODOLLAR_DECIMALS)
}

/**
 * Increment the daily and lifetime spend counters for an API key.
 *
 * The daily key has a 24h TTL so it rolls over automatically; the lifetime key
 * has no TTL. Reads and writes are parallelized — invoked from
 * `ctx.waitUntil` so it does not block the response, but parallelism keeps the
 * background work cheap.
 *
 * The read-modify-write is not atomic — two concurrent sponsorships for the
 * same key can drop one increment. PostHog `SPONSORSHIP_REQUEST` events
 * remain the source of truth for audit.
 */
export async function recordSpend(
	apiKey: string,
	gasUsed: bigint,
	effectiveGasPrice: bigint,
): Promise<void> {
	const fee = attodollarToMicrodollar(gasUsed * effectiveGasPrice)

	const [currentDaily, currentLifetime] = await Promise.all([
		getDailySpend(apiKey),
		getLifetimeSpend(apiKey),
	])

	await Promise.all([
		env.SponsorApiKeyStore!.put(
			dailySpendKvKey(apiKey),
			(currentDaily + fee).toString(),
			{ expirationTtl: 86_400 },
		),
		env.SponsorApiKeyStore!.put(
			lifetimeSpendKvKey(apiKey),
			(currentLifetime + fee).toString(),
		),
	])
}

/**
 * Check whether the API key's daily budget allows a transaction with the
 * estimated fee.  Returns `true` if within budget (or no limit set).
 */
export async function checkBudget(
	apiKey: string,
	record: ApiKeyRecord,
	estimatedGas: bigint,
	maxFeePerGas: bigint,
): Promise<{ allowed: boolean; reason?: string }> {
	if (!record.dailyLimitUsd) return { allowed: true }

	const limitMicroUsd = parseUnits(record.dailyLimitUsd, MICRODOLLAR_DECIMALS)
	if (limitMicroUsd <= 0n) return { allowed: true }

	const currentSpend = await getDailySpend(apiKey)
	const txFee = attodollarToMicrodollar(estimatedGas * maxFeePerGas)

	if (currentSpend + txFee > limitMicroUsd) {
		return {
			allowed: false,
			reason: `Daily spend limit exceeded (spent: $${formatMicrodollarUsd(currentSpend)}, limit: $${record.dailyLimitUsd})`,
		}
	}

	return { allowed: true }
}
