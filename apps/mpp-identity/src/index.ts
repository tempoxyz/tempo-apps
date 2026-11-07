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
/** Codes per inbox per sender per 10 minutes. */
const EMAIL_RATE_LIMIT = 3
/**
 * Codes per inbox per hour from all senders, bounding email bombing by many
 * senders. Once it is full a sender new to the inbox in the last 10 minutes,
 * such as its owner, still gets one code from {@link INBOX_NEW_SENDER_LIMIT}.
 */
const INBOX_RATE_LIMIT = 20
const INBOX_RATE_WINDOW_MS = 60 * 60 * 1000
/**
 * Codes per inbox per hour to new senders once the inbox is full. It bounds an
 * inbox's sends, and so its code guesses, whatever the number of senders: at
 * most 30 codes and 150 guesses an hour.
 */
const INBOX_NEW_SENDER_LIMIT = 10
const IP_RATE_LIMIT = 10
const DEFAULT_ATTESTATION_TTL = 86_400
const INVALID_CODE = 'Invalid or expired code.'

type Env = { Bindings: CloudflareBindings }

const app = new Hono<Env>()

app.use(
	'*',
	cors({
		origin: '*',
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		// So browser clients on other origins can read when to retry a 429.
		exposeHeaders: ['Retry-After'],
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
	// There is no per-domain cap: one shared counter for gmail.com or a company
	// domain would let anyone lock all of its users out.
	// Limits per inbox are per sender, so one sender cannot use up the inbox's
	// quota and lock its owner out; a looser inbox-wide limit bounds the rest.
	const limiter = (key: string) =>
		c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(key))
	const perSender = limiter(`email:${inbox}:${client}`)
	const limiters: [ReturnType<typeof limiter>, number, number][] = [
		[limiter(`ip:${client}`), IP_RATE_LIMIT, RATE_LIMIT_WINDOW_MS],
		[perSender, EMAIL_RATE_LIMIT, RATE_LIMIT_WINDOW_MS],
	]
	// Check every limit before recording a hit, so a request one limit refuses
	// does not use up the others.
	let retryAfterSeconds = 0
	for (const [bucket, limit, window] of limiters) {
		const result = await bucket.check(limit, window)
		if (!result.allowed)
			retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds)
	}
	const shared = limiter(`inbox:${inbox}`)
	const inboxResult = await shared.check(INBOX_RATE_LIMIT, INBOX_RATE_WINDOW_MS)
	if (inboxResult.allowed)
		limiters.push([shared, INBOX_RATE_LIMIT, INBOX_RATE_WINDOW_MS])
	else {
		// A full inbox still serves a sender new to it from a bounded inbox-wide
		// allowance, once per sender per hour, so a few reused senders cannot
		// keep draining it.
		const exempt = limiter(`inbox-new:${inbox}`)
		const exemptSender = limiter(`inbox-new:${inbox}:${client}`)
		const [newSender, senderAllowance, allowance] = await Promise.all([
			perSender.check(1, RATE_LIMIT_WINDOW_MS),
			exemptSender.check(1, INBOX_RATE_WINDOW_MS),
			exempt.check(INBOX_NEW_SENDER_LIMIT, INBOX_RATE_WINDOW_MS),
		])
		if (!newSender.allowed || !senderAllowance.allowed || !allowance.allowed)
			retryAfterSeconds = Math.max(
				retryAfterSeconds,
				allowance.allowed
					? inboxResult.retryAfterSeconds
					: Math.min(
							inboxResult.retryAfterSeconds,
							allowance.retryAfterSeconds,
						),
			)
		// Recorded against a limit of 1, so concurrent requests from the sender
		// get one code, not the usual 3.
		limiters[1] = [perSender, 1, RATE_LIMIT_WINDOW_MS]
		limiters.push(
			[exemptSender, 1, INBOX_RATE_WINDOW_MS],
			[exempt, INBOX_NEW_SENDER_LIMIT, INBOX_RATE_WINDOW_MS],
		)
	}
	if (retryAfterSeconds > 0) {
		c.header('Retry-After', String(retryAfterSeconds))
		return c.json({ error: 'Too many requests. Try again later.' }, 429)
	}
	// A request a concurrent one beat to a limit releases the hits it already
	// recorded, so a refused request uses up no limit, its own or the inbox's.
	const recorded: [ReturnType<typeof limiter>, number][] = []
	for (const [bucket, limit, window] of limiters) {
		const result = await bucket.hit(limit, window)
		if (result.allowed && result.at !== undefined) {
			recorded.push([bucket, result.at])
			continue
		}
		await Promise.all(recorded.map(([held, at]) => held.release(at)))
		c.header(
			'Retry-After',
			String(result.allowed ? 1 : result.retryAfterSeconds),
		)
		return c.json({ error: 'Too many requests. Try again later.' }, 429)
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
	const result = await store.verify(await hashCode(id, code))
	if (!result.ok) return c.json({ error: INVALID_CODE }, 400)

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
