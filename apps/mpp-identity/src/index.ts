import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { randomId, sha256, toBase64Url } from './lib/encoding.ts'
import { loadSigningKey, signAttestation } from './lib/jws.ts'
import {
	generateCode,
	hashCode,
	isCode,
	isOtpId,
	OTP_TTL_MS,
} from './lib/otp.ts'
import { canonicalInbox, clientBucket } from './lib/rate-limit-keys.ts'
import { normalizeAudience, normalizeEmail } from './lib/validate.ts'

export { OtpStore, RateLimiter } from './durable-objects.ts'

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const EMAIL_RATE_LIMIT = 3
const IP_RATE_LIMIT = 10
const DEFAULT_ATTESTATION_TTL = 86_400
const INVALID_CODE = 'Invalid or expired code.'
/**
 * Wrong codes accepted per inbox per day, across all its code requests. The
 * per-id cap alone allows thousands of guesses a day against one address.
 */
const FAILED_VERIFY_LIMIT = 10
const FAILED_VERIFY_WINDOW_MS = 24 * 60 * 60 * 1000
const TOO_MANY_FAILURES =
	'Too many wrong codes for this address. Try again later.'

type Env = { Bindings: CloudflareBindings }

const app = new Hono<Env>()

app.use(
	'*',
	cors({
		origin: '*',
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		maxAge: 86_400,
	}),
)

app.get('/', (c) =>
	c.json({
		name: 'mpp-identity',
		description:
			'Issues MPP identity attestations (compact EdDSA JWS) that MPP servers accept in the Identity-Attestation header.',
		version: 1,
		issuer: c.env.ISSUER,
		types: ['email'],
		endpoints: {
			'POST /email/otp': 'Send a one-time code. Body: {"email", "audience"}',
			'POST /email/verify':
				'Exchange the code for an attestation. Body: {"id", "code"}',
			'GET /.well-known/jwks.json': 'Public keys that verify attestations',
		},
	}),
)

app.get('/.well-known/jwks.json', async (c) => {
	const key = await loadSigningKey(c.env.ATTESTATION_PRIVATE_KEY)
	c.header('Cache-Control', 'public, max-age=300')
	return c.json({ keys: [key.publicJwk] })
})

app.post('/email/otp', async (c) => {
	const body = await readJson(c.req.raw)
	const email = normalizeEmail(body?.email)
	if (!email) return c.json({ error: 'Invalid email address.' }, 400)
	const audience = normalizeAudience(body?.audience)
	if (!audience)
		return c.json(
			{
				error:
					'Invalid audience: expected an https origin such as https://example.com.',
			},
			400,
		)

	const client = clientBucket(
		c.req.header('CF-Connecting-IP'),
		c.req.header('CF-Worker'),
	)
	const inbox = await inboxKey(email)
	// An inbox locked by wrong codes gets no new ones until the lock clears.
	const locked = await failureLimiter(c.env, inbox).check(
		FAILED_VERIFY_LIMIT,
		FAILED_VERIFY_WINDOW_MS,
	)
	if (!locked.allowed) {
		c.header('Retry-After', String(locked.retryAfterSeconds))
		return c.json({ error: TOO_MANY_FAILURES }, 429)
	}
	// There is no per-domain cap: one shared counter for gmail.com or a company
	// domain would let anyone lock all of its users out.
	const limiters = (
		[
			[`ip:${client}`, IP_RATE_LIMIT],
			[`email:${inbox}`, EMAIL_RATE_LIMIT],
		] as const
	).map(
		([key, limit]) =>
			[
				c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(key)),
				limit,
			] as const,
	)
	// Check every limit before recording a hit, so a request one limit refuses
	// does not use up the others.
	let retryAfterSeconds = 0
	for (const [limiter, limit] of limiters) {
		const result = await limiter.check(limit, RATE_LIMIT_WINDOW_MS)
		if (!result.allowed)
			retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds)
	}
	if (retryAfterSeconds > 0) {
		c.header('Retry-After', String(retryAfterSeconds))
		return c.json({ error: 'Too many requests. Try again later.' }, 429)
	}
	for (const [limiter, limit] of limiters) {
		const result = await limiter.hit(limit, RATE_LIMIT_WINDOW_MS)
		// A concurrent request filled the bucket between check and hit.
		if (!result.allowed) {
			c.header('Retry-After', String(result.retryAfterSeconds))
			return c.json({ error: 'Too many requests. Try again later.' }, 429)
		}
	}

	const id = randomId(16)
	const code = generateCode()
	const expiresAt = Date.now() + OTP_TTL_MS
	const store = c.env.OTP_STORE.get(c.env.OTP_STORE.idFromName(id))
	await store.create({
		codeHash: await hashCode(id, code),
		email,
		audience,
		expiresAt,
		attempts: 0,
	})

	const devLog = c.env.DEV_LOG_OTP === 'true'
	// Local development only: emails are not delivered, so print the code. Never enable in production.
	if (devLog) console.log(`OTP for ${id}: ${code}`)

	try {
		await c.env.EMAIL.send(buildEmail(c.env.EMAIL_FROM, email, audience, code))
	} catch (error) {
		if (!devLog) {
			console.error('email send failed', {
				id,
				error: error instanceof Error ? error.message : String(error),
			})
			await store.delete()
			return c.json({ error: 'Failed to send the verification email.' }, 502)
		}
		console.warn('email send failed; continuing because DEV_LOG_OTP=true')
	}

	return c.json({ id, expires_at: new Date(expiresAt).toISOString() })
})

app.post('/email/verify', async (c) => {
	const body = await readJson(c.req.raw)
	const id = body?.id
	const code = body?.code
	if (!isOtpId(id) || !isCode(code)) return c.json({ error: INVALID_CODE }, 400)

	const store = c.env.OTP_STORE.get(c.env.OTP_STORE.idFromName(id))
	const email = await store.recipient()
	if (!email) return c.json({ error: INVALID_CODE }, 400)
	const failures = failureLimiter(c.env, await inboxKey(email))
	const allowed = await failures.check(
		FAILED_VERIFY_LIMIT,
		FAILED_VERIFY_WINDOW_MS,
	)
	if (!allowed.allowed) {
		c.header('Retry-After', String(allowed.retryAfterSeconds))
		return c.json({ error: TOO_MANY_FAILURES }, 429)
	}
	const result = await store.verify(await hashCode(id, code))
	if (!result.ok) {
		await failures.hit(FAILED_VERIFY_LIMIT, FAILED_VERIFY_WINDOW_MS)
		return c.json({ error: INVALID_CODE }, 400)
	}

	const key = await loadSigningKey(c.env.ATTESTATION_PRIVATE_KEY)
	const iat = Math.floor(Date.now() / 1000)
	const exp = iat + attestationTtl(c.env.ATTESTATION_TTL)
	const attestation = await signAttestation(key, {
		iss: c.env.ISSUER,
		aud: result.audience,
		sub: result.email,
		type: 'email',
		iat,
		exp,
		jti: randomId(16),
	})
	return c.json({ attestation, expires_at: new Date(exp * 1000).toISOString() })
})

app.notFound((c) => c.json({ error: 'Not found.' }, 404))

app.onError((error, c) => {
	console.error('unhandled error', {
		error: error instanceof Error ? error.message : String(error),
	})
	return c.json({ error: 'Internal error.' }, 500)
})

export default app

/** The rate-limit key of an address's inbox: its canonical form, hashed. */
async function inboxKey(email: string): Promise<string> {
	return toBase64Url(await sha256(canonicalInbox(email)))
}

function failureLimiter(env: CloudflareBindings, inbox: string) {
	return env.RATE_LIMITER.get(
		env.RATE_LIMITER.idFromName(`verify-fail:${inbox}`),
	)
}

async function readJson(
	request: Request,
): Promise<Record<string, unknown> | undefined> {
	try {
		const body: unknown = await request.json()
		if (body && typeof body === 'object' && !Array.isArray(body))
			return body as Record<string, unknown>
	} catch {}
	return undefined
}

function attestationTtl(value: string | undefined): number {
	const ttl = Number(value)
	return Number.isInteger(ttl) && ttl > 0 ? ttl : DEFAULT_ATTESTATION_TTL
}

function buildEmail(
	from: string,
	to: string,
	audience: string,
	code: string,
): EmailMessageBuilder {
	const host = new URL(audience).host
	const text = [
		`Your verification code for ${host} is: ${code}`,
		'',
		`This code lets ${host} confirm that you control this email address. It expires in 10 minutes.`,
		'',
		'If you did not request this code, you can ignore this email.',
	].join('\n')
	const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5"><p>Your verification code for <strong>${escapeHtml(host)}</strong> is:</p><p style="font-size:28px;font-weight:600;letter-spacing:4px">${code}</p><p>This code lets ${escapeHtml(host)} confirm that you control this email address. It expires in 10 minutes.</p><p>If you did not request this code, you can ignore this email.</p></body></html>`
	return {
		from,
		to,
		subject: `Your verification code for ${host}`,
		text,
		html,
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}
