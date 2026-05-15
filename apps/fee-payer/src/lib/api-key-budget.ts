import { env } from 'cloudflare:workers'
import { parseUnits, formatUnits } from 'viem'
import type { ApiKeyRecord } from './api-keys.js'

const MICRODOLLAR_DECIMALS = 6
const ATTODOLLARS_PER_MICRODOLLAR = 10n ** 12n

function attodollarToMicrodollar(attodollars: bigint) {
	return (
		(attodollars + ATTODOLLARS_PER_MICRODOLLAR - 1n) /
		ATTODOLLARS_PER_MICRODOLLAR
	)
}

function spendKvKey(apiKey: string) {
	const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
	return `spend:${apiKey}:${today}`
}

/** Read the current daily spend for an API key from KV. */
async function getDailySpend(apiKey: string): Promise<bigint> {
	const raw = await env.SponsorApiKeyStore!.get(spendKvKey(apiKey))
	if (!raw) return 0n
	return BigInt(raw)
}

/** Increment the daily spend for an API key. */
export async function recordSpend(
	apiKey: string,
	gasUsed: bigint,
	effectiveGasPrice: bigint,
): Promise<void> {
	const fee = attodollarToMicrodollar(gasUsed * effectiveGasPrice)
	const key = spendKvKey(apiKey)
	const current = await getDailySpend(apiKey)
	await env.SponsorApiKeyStore!.put(key, (current + fee).toString(), {
		expirationTtl: 86_400,
	})
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
			reason: `Daily spend limit exceeded (spent: $${formatUnits(currentSpend, MICRODOLLAR_DECIMALS)}, limit: $${record.dailyLimitUsd})`,
		}
	}

	return { allowed: true }
}
