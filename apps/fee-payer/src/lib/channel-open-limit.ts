import { env } from 'cloudflare:workers'

export const CHANNEL_OPEN_DAILY_LIMIT = 5
export const TIP20_CHANNEL_RESERVE_ADDRESS =
	'0x4d50500000000000000000000000000000000000'
export const TIP20_CHANNEL_OPEN_SELECTOR = '0xedc53b00'

type TempoCall = {
	to?: string
	input?: string
	data?: string
}

type TempoTransaction = {
	from?: string
	to?: string
	input?: string
	data?: string
	calls?: TempoCall[]
}

function utcDay(date = new Date()) {
	return date.toISOString().slice(0, 10)
}

function secondsUntilNextUtcDay(date = new Date()) {
	const nextDay = new Date(date)
	nextDay.setUTCHours(24, 0, 0, 0)
	return Math.max(1, Math.ceil((nextDay.getTime() - date.getTime()) / 1_000))
}

function channelOpenKvKey(from: string, day = utcDay()) {
	return `channel-open:${from.toLowerCase()}:${day}`
}

export function isTip20ChannelOpen(transaction: TempoTransaction) {
	const call = transaction.calls?.[0]
	const to = (call?.to ?? transaction.to ?? '').toLowerCase()
	const input = (
		call?.input ??
		call?.data ??
		transaction.input ??
		transaction.data ??
		''
	).toLowerCase()

	return (
		to === TIP20_CHANNEL_RESERVE_ADDRESS &&
		input.startsWith(TIP20_CHANNEL_OPEN_SELECTOR)
	)
}

/**
 * Reserves one daily sponsored channel-open slot for a payer address.
 *
 * Cloudflare KV does not provide atomic increments, so this is a best-effort
 * guard. Reserving before relay sponsorship prevents a single sequential client
 * from exceeding the quota and reduces the blast radius of bursty clients.
 */
export async function reserveChannelOpenSponsorship(
	from: string,
	limit = CHANNEL_OPEN_DAILY_LIMIT,
): Promise<{ allowed: boolean; count: number; limit: number }> {
	if (!env.SponsorApiKeyStore) {
		throw new Error('SponsorApiKeyStore binding is not configured')
	}

	const key = channelOpenKvKey(from)
	const current = Number.parseInt(
		(await env.SponsorApiKeyStore.get(key)) ?? '0',
		10,
	)
	const count = Number.isFinite(current) ? current : 0
	if (count >= limit) return { allowed: false, count, limit }

	const next = count + 1
	await env.SponsorApiKeyStore.put(key, next.toString(), {
		expirationTtl: secondsUntilNextUtcDay(),
	})

	return { allowed: true, count: next, limit }
}
