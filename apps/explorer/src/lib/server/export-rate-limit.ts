import { DurableObject, env } from 'cloudflare:workers'
import type { Address } from 'ox'
import { getRequestHeader } from '@tanstack/react-start/server'

const RATE_LIMIT_WINDOW_MS = 10 * 60_000
const RATE_LIMITS = {
	ip: 20,
	wallet: 5,
} as const

type RateLimitBucket = {
	count: number
	resetAt: number
}

type RateLimitResult = {
	allowed: boolean
	remaining: number
	retryAfterSeconds: number
}

type ExportRateLimitEnv = Cloudflare.Env & {
	EXPLORER_EXPORT_RATE_LIMIT?: DurableObjectNamespace<ExplorerExportRateLimit>
}

export class RateLimitExceededError extends Error {
	retryAfterSeconds: number

	constructor(message: string, retryAfterSeconds: number) {
		super(message)
		this.name = 'RateLimitExceededError'
		this.retryAfterSeconds = retryAfterSeconds
	}
}

export class ExplorerExportRateLimit extends DurableObject {
	async fetch(request: Request): Promise<Response> {
		const body = (await request.json()) as {
			limit?: number
			windowMs?: number
		}

		const limit =
			typeof body.limit === 'number' && Number.isFinite(body.limit)
				? Math.floor(body.limit)
				: 0
		const windowMs =
			typeof body.windowMs === 'number' && Number.isFinite(body.windowMs)
				? Math.floor(body.windowMs)
				: 0

		if (limit < 1 || windowMs < 1) {
			return Response.json(
				{ error: 'Invalid export rate limit request' },
				{ status: 400 },
			)
		}

		const now = Date.now()
		const existing = await this.ctx.storage.get<RateLimitBucket>('bucket')
		const bucket =
			existing && existing.resetAt > now
				? existing
				: { count: 0, resetAt: now + windowMs }

		if (bucket.count >= limit) {
			return Response.json({
				allowed: false,
				remaining: 0,
				retryAfterSeconds: Math.max(
					1,
					Math.ceil((bucket.resetAt - now) / 1000),
				),
			} satisfies RateLimitResult)
		}

		bucket.count += 1
		await this.ctx.storage.put('bucket', bucket)
		await this.ctx.storage.setAlarm(bucket.resetAt)

		return Response.json({
			allowed: true,
			remaining: Math.max(0, limit - bucket.count),
			retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
		} satisfies RateLimitResult)
	}

	async alarm(): Promise<void> {
		const bucket = await this.ctx.storage.get<RateLimitBucket>('bucket')
		if (!bucket || bucket.resetAt > Date.now()) return

		await this.ctx.storage.deleteAll()
	}
}

function getRateLimitNamespace(): DurableObjectNamespace<ExplorerExportRateLimit> | null {
	return (env as ExportRateLimitEnv).EXPLORER_EXPORT_RATE_LIMIT ?? null
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
	key: string
	limit: number
	windowMs: number
}): Promise<RateLimitResult> {
	const namespace = getRateLimitNamespace()
	if (!namespace) {
		return {
			allowed: true,
			remaining: params.limit,
			retryAfterSeconds: 0,
		}
	}

	const id = namespace.idFromName(params.key)
	const stub = namespace.get(id)
	const response = await stub.fetch('https://rate-limit/consume', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ limit: params.limit, windowMs: params.windowMs }),
	})

	if (!response.ok) {
		throw new Error('Failed to check export rate limit')
	}

	return (await response.json()) as RateLimitResult
}

export async function enforceCsvExportRateLimit(
	address: Address.Address,
): Promise<void> {
	const ip = getClientIp()
	if (!ip) return

	const normalizedAddress = address.toLowerCase()
	const [ipResult, walletResult] = await Promise.all([
		consumeRateLimit({
			key: `csv-export:ip:${ip}`,
			limit: RATE_LIMITS.ip,
			windowMs: RATE_LIMIT_WINDOW_MS,
		}),
		consumeRateLimit({
			key: `csv-export:ip:${ip}:wallet:${normalizedAddress}`,
			limit: RATE_LIMITS.wallet,
			windowMs: RATE_LIMIT_WINDOW_MS,
		}),
	])

	if (!ipResult.allowed) {
		throw new RateLimitExceededError(
			'Too many CSV exports from this IP. Please wait a few minutes before trying again.',
			ipResult.retryAfterSeconds,
		)
	}

	if (!walletResult.allowed) {
		throw new RateLimitExceededError(
			'Too many CSV exports for this wallet from your IP. Please wait a few minutes before trying again.',
			walletResult.retryAfterSeconds,
		)
	}
}
