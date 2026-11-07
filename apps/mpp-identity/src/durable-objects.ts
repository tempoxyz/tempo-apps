import { DurableObject } from 'cloudflare:workers'
import { timingSafeEqual, fromBase64Url } from './lib/encoding.ts'
import { OTP_MAX_ATTEMPTS } from './lib/otp.ts'

export type OtpRecord = {
	/** base64url SHA-256(id + code). */
	codeHash: string
	email: string
	audience: string
	/** Unix milliseconds. */
	expiresAt: number
	attempts: number
}

export type VerifyResult =
	| { ok: true; email: string; audience: string }
	| { ok: false; reason: 'invalid' | 'expired' | 'burned' }

/** One instance per OTP id (idFromName(id)). Single-threaded, so attempts are counted atomically. */
export class OtpStore extends DurableObject<CloudflareBindings> {
	async create(record: OtpRecord): Promise<void> {
		await this.ctx.storage.put('otp', record)
		await this.ctx.storage.setAlarm(record.expiresAt)
	}

	async verify(codeHash: string, now = Date.now()): Promise<VerifyResult> {
		const record = await this.ctx.storage.get<OtpRecord>('otp')
		if (!record) return { ok: false, reason: 'invalid' }
		if (now >= record.expiresAt) {
			await this.burn()
			return { ok: false, reason: 'expired' }
		}
		if (
			timingSafeEqual(fromBase64Url(codeHash), fromBase64Url(record.codeHash))
		) {
			// Single use.
			await this.burn()
			return { ok: true, email: record.email, audience: record.audience }
		}
		const attempts = record.attempts + 1
		if (attempts >= OTP_MAX_ATTEMPTS) {
			await this.burn()
			return { ok: false, reason: 'burned' }
		}
		await this.ctx.storage.put('otp', { ...record, attempts })
		return { ok: false, reason: 'invalid' }
	}

	async delete(): Promise<void> {
		await this.burn()
	}

	override async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll()
	}

	private async burn(): Promise<void> {
		await this.ctx.storage.deleteAlarm()
		await this.ctx.storage.deleteAll()
	}
}

export type RateLimitResult =
	| { allowed: true }
	| { allowed: false; retryAfterSeconds: number }

/** Sliding-window limiter. One instance per key (idFromName(key)). */
export class RateLimiter extends DurableObject<CloudflareBindings> {
	async hit(
		limit: number,
		windowMs: number,
		now = Date.now(),
	): Promise<RateLimitResult> {
		const hits = ((await this.ctx.storage.get<number[]>('hits')) ?? []).filter(
			(time) => time > now - windowMs,
		)
		if (hits.length >= limit) {
			const oldest = hits[0] ?? now
			return {
				allowed: false,
				retryAfterSeconds: Math.max(
					1,
					Math.ceil((oldest + windowMs - now) / 1000),
				),
			}
		}
		hits.push(now)
		await this.ctx.storage.put('hits', hits)
		await this.ctx.storage.setAlarm(now + windowMs)
		return { allowed: true }
	}

	override async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll()
	}
}
