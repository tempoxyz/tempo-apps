import { env } from 'cloudflare:workers'
import { getRequestHeader } from '@tanstack/react-start/server'

const RATE_LIMIT_PERIOD_SECONDS = 60

type RateLimitResult = {
	allowed: boolean
	retryAfterSeconds: number
}

export class RateLimitExceededError extends Error {
	retryAfterSeconds: number

	constructor(message: string, retryAfterSeconds: number) {
		super(message)
		this.name = 'RateLimitExceededError'
		this.retryAfterSeconds = retryAfterSeconds
	}
}

function getClientIp(): string | null {
	const cfConnectingIp = getRequestHeader('cf-connecting-ip')?.trim()
	if (cfConnectingIp) return cfConnectingIp

	const forwardedFor = getRequestHeader('x-forwarded-for')
		?.split(',')
		.map((value) => value.trim())
		.find(Boolean)
	if (forwardedFor) return forwardedFor

	const realIp = getRequestHeader('x-real-ip')?.trim()
	if (realIp) return realIp

	return null
}

async function consumeRateLimit(params: {
	limiter: RateLimit
	key: string
}): Promise<RateLimitResult> {
	if (!params.limiter)
		return {
			allowed: true,
			retryAfterSeconds: 0,
		}

	const { success } = await params.limiter.limit({ key: params.key })

	return {
		allowed: success,
		retryAfterSeconds: success ? 0 : RATE_LIMIT_PERIOD_SECONDS,
	}
}

export async function enforceCsvExportRateLimit(): Promise<void> {
	const ip = getClientIp()
	if (!ip) return

	const result = await consumeRateLimit({
		limiter: env.EXPLORER_EXPORT_RATE_LIMIT,
		key: `csv-export:ip:${ip}`,
	})

	if (!result.allowed) {
		throw new RateLimitExceededError(
			'Too many CSV exports from this IP. Please wait a few minutes before trying again.',
			result.retryAfterSeconds,
		)
	}
}
