import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import type { OtpRecord, OtpStore } from '../src/durable-objects.ts'
import {
	fromBase64Url,
	sha256,
	toBase64Url,
	utf8,
} from '../src/lib/encoding.ts'
import { generateCode } from '../src/lib/otp.ts'
import {
	codeFrom,
	createClient,
	decodeJson,
	uniqueEmail,
	uniqueIp,
} from './helpers.ts'

type OtpResponse = { id: string; expires_at: string }
type VerifyResponse = { attestation: string; expires_at: string }
type Jwks = { keys: Record<string, string>[] }

const audience = 'https://merchant.example'

async function sendCode(
	client: ReturnType<typeof createClient>,
	email = uniqueEmail(),
	aud = audience,
) {
	const response = await client.request('POST', '/email/otp', {
		email,
		audience: aud,
	})
	expect(response.status).toBe(200)
	const body = (await response.json()) as OtpResponse
	return { ...body, code: codeFrom(client.sent.at(-1)), email }
}

function verify(
	client: ReturnType<typeof createClient>,
	id: string,
	code: string,
) {
	return client.request('POST', '/email/verify', { id, code })
}

describe('POST /email/otp', () => {
	it('sends an 8-digit code to the normalized email', async () => {
		const client = createClient()
		const before = Date.now()
		const response = await client.request('POST', '/email/otp', {
			email: '  Alice@Example.COM ',
			audience: 'https://shop.example.com/',
		})
		expect(response.status).toBe(200)
		const body = (await response.json()) as OtpResponse
		expect(body.id).toMatch(/^[A-Za-z0-9_-]{22}$/)
		const expiresAt = Date.parse(body.expires_at)
		expect(expiresAt - before).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000)
		expect(expiresAt - before).toBeLessThanOrEqual(10 * 60 * 1000 + 1000)

		expect(client.sent).toHaveLength(1)
		const email = client.sent[0]
		expect(email?.to).toBe('alice@example.com')
		expect(email?.from).toBe('noreply@identity.test')
		expect(email?.subject).toBe('Your verification code for shop.example.com')
		expect(email?.text).toContain('shop.example.com')
		expect(email?.text).toContain('10 minutes')
		expect(email?.text).toContain('did not request')
		expect(codeFrom(email)).toMatch(/^\d{8}$/)
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
	})

	it('stores only the hash of id + code', async () => {
		const client = createClient()
		const { id, code } = await sendCode(client)
		const stub = env.OTP_STORE.get(env.OTP_STORE.idFromName(id))
		const record = await runInDurableObject(stub, (_, state) =>
			state.storage.get<OtpRecord>('otp'),
		)
		expect(record?.codeHash).toBe(toBase64Url(await sha256(id + code)))
		expect(JSON.stringify(record)).not.toContain(`"${code}"`)
		expect(record?.attempts).toBe(0)
	})

	it('rejects a body over 4 KB before rate limiting', async () => {
		const client = createClient()
		const response = await client.request('POST', '/email/otp', {
			email: uniqueEmail(),
			audience,
			padding: 'x'.repeat(5000),
		})
		expect(response.status).toBe(400)
		expect(client.sent).toHaveLength(0)
	})

	it.each([
		['missing', undefined],
		['no at sign', 'alice.example.com'],
		['two at signs', 'a@b@example.com'],
		['whitespace', 'al ice@example.com'],
		['CRLF', 'alice@example.com\r\nBcc: x@y.z'],
		['quotes', '"alice"@example.com'],
		['angle brackets', '<alice@example.com>'],
		['comma', 'alice@example.com,bob@example.com'],
		['no tld', 'alice@localhost'],
		['too long', `${'a'.repeat(60)}@${'b'.repeat(200)}.com`],
	])('rejects invalid email (%s)', async (_, email) => {
		const client = createClient()
		const response = await client.request('POST', '/email/otp', {
			email,
			audience,
		})
		expect(response.status).toBe(400)
		expect(((await response.json()) as { error: string }).error).toBeTruthy()
		expect(client.sent).toHaveLength(0)
	})

	it.each([
		['missing', undefined],
		['http', 'http://merchant.example'],
		['path', 'https://merchant.example/pay'],
		['query', 'https://merchant.example?x=1'],
		['not a url', 'merchant.example'],
		['uppercase host', 'https://Merchant.example'],
		['default port', 'https://merchant.example:443'],
		['userinfo', 'https://user@merchant.example'],
		['http other host', 'http://192.168.1.1:3000'],
		['punctuation in host', 'https://pay!now(merchant).example'],
		['overlong label', `https://${'a'.repeat(64)}.example`],
	])('rejects invalid audience (%s)', async (_, aud) => {
		const client = createClient()
		const response = await client.request('POST', '/email/otp', {
			email: uniqueEmail(),
			audience: aud,
		})
		expect(response.status).toBe(400)
		expect(client.sent).toHaveLength(0)
	})

	it.each([
		'https://merchant.example:8443',
		'http://localhost:3000',
		'http://localhost',
		'http://127.0.0.1:8080/',
	])('accepts audience %s', async (aud) => {
		const client = createClient()
		const response = await client.request('POST', '/email/otp', {
			email: uniqueEmail(),
			audience: aud,
		})
		expect(response.status).toBe(200)
	})

	it('rejects a non-JSON body', async () => {
		const client = createClient()
		const response = await client.request('POST', '/email/otp')
		expect(response.status).toBe(400)
	})

	it('rate limits per email', async () => {
		const client = createClient()
		const email = uniqueEmail()
		const ip = uniqueIp()
		for (let i = 0; i < 3; i++)
			await client.request(
				'POST',
				'/email/otp',
				{ email, audience },
				{ 'CF-Connecting-IP': ip },
			)
		const response = await client.request(
			'POST',
			'/email/otp',
			{ email: email.toUpperCase(), audience },
			{ 'CF-Connecting-IP': ip },
		)
		expect(response.status).toBe(429)
		expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
		expect(client.sent).toHaveLength(3)
	})

	it('rate limits per client IP', async () => {
		const client = createClient()
		const ip = uniqueIp()
		const send = () =>
			client.request(
				'POST',
				'/email/otp',
				{ email: uniqueEmail(), audience },
				{ 'CF-Connecting-IP': ip },
			)
		for (let i = 0; i < 10; i++) expect((await send()).status).toBe(200)
		const response = await send()
		expect(response.status).toBe(429)
		expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
		expect(response.headers.get('Access-Control-Expose-Headers')).toContain(
			'Retry-After',
		)
	})

	it('returns 502 and discards the code when the email cannot be sent', async () => {
		const client = createClient({ failSend: true })
		const response = await client.request('POST', '/email/otp', {
			email: uniqueEmail(),
			audience,
		})
		expect(response.status).toBe(502)
	})
})

describe('POST /email/verify', () => {
	it('returns a signed attestation that verifies against the JWKS', async () => {
		const client = createClient()
		const { id, code, email } = await sendCode(client)
		const before = Math.floor(Date.now() / 1000)
		const response = await verify(client, id, code)
		expect(response.status).toBe(200)
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
		const body = (await response.json()) as VerifyResponse

		const [headerB64, payloadB64, signatureB64] = body.attestation.split('.')
		if (!headerB64 || !payloadB64 || !signatureB64) throw new Error('not a JWS')
		expect(signatureB64).not.toContain('=')

		const jwks = (await (
			await client.request('GET', '/.well-known/jwks.json')
		).json()) as Jwks
		const jwk = jwks.keys[0]
		if (!jwk) throw new Error('no key')

		const header = decodeJson(headerB64)
		expect(header).toEqual({
			alg: 'EdDSA',
			typ: 'mpp-attestation+jwt',
			kid: jwk.kid,
		})

		const payload = decodeJson(payloadB64)
		expect(payload).toMatchObject({
			iss: 'https://identity.test',
			aud: audience,
			sub: email,
			type: 'email',
		})
		expect(payload.iat).toBeGreaterThanOrEqual(before)
		expect(payload.exp).toBe((payload.iat as number) + 3600)
		expect(payload.jti).toMatch(/^[A-Za-z0-9_-]{22}$/)
		expect(Date.parse(body.expires_at)).toBe((payload.exp as number) * 1000)

		const publicKey = await crypto.subtle.importKey(
			'jwk',
			{ kty: 'OKP', crv: 'Ed25519', x: jwk.x },
			{ name: 'Ed25519' },
			false,
			['verify'],
		)
		const valid = await crypto.subtle.verify(
			{ name: 'Ed25519' },
			publicKey,
			fromBase64Url(signatureB64),
			utf8(`${headerB64}.${payloadB64}`),
		)
		expect(valid).toBe(true)

		const tampered = await crypto.subtle.verify(
			{ name: 'Ed25519' },
			publicKey,
			fromBase64Url(signatureB64),
			utf8(`${headerB64}.${payloadB64}x`),
		)
		expect(tampered).toBe(false)
	})

	it('uses the normalized audience origin as aud', async () => {
		const client = createClient()
		const { id, code } = await sendCode(
			client,
			uniqueEmail(),
			'http://localhost:3000/',
		)
		const body = (await (
			await verify(client, id, code)
		).json()) as VerifyResponse
		const payload = decodeJson(body.attestation.split('.')[1] ?? '')
		expect(payload.aud).toBe('http://localhost:3000')
	})

	it('rejects a wrong code with a uniform error', async () => {
		const client = createClient()
		const { id, code } = await sendCode(client)
		const wrong = code === '00000000' ? '00000001' : '00000000'
		const response = await verify(client, id, wrong)
		expect(response.status).toBe(400)
		expect(await response.json()).toEqual({ error: 'Invalid or expired code.' })
		// The right code still works after one wrong attempt.
		expect((await verify(client, id, code)).status).toBe(200)
	})

	it('rejects unknown ids and malformed input with the same error', async () => {
		const client = createClient()
		for (const body of [
			{ id: 'A'.repeat(22), code: '123456' },
			{ id: 'short', code: '123456' },
			{ id: 'A'.repeat(22), code: '12345' },
			{ id: 'A'.repeat(22), code: 123456 },
			{},
		]) {
			const response = await client.request('POST', '/email/verify', body)
			expect(response.status).toBe(400)
			expect(await response.json()).toEqual({
				error: 'Invalid or expired code.',
			})
		}
	})

	it('is single use', async () => {
		const client = createClient()
		const { id, code } = await sendCode(client)
		expect((await verify(client, id, code)).status).toBe(200)
		const second = await verify(client, id, code)
		expect(second.status).toBe(400)
		expect(await second.json()).toEqual({ error: 'Invalid or expired code.' })
	})

	it('rejects an expired code', async () => {
		const client = createClient()
		const { id, code } = await sendCode(client)
		const stub = env.OTP_STORE.get(env.OTP_STORE.idFromName(id))
		await runInDurableObject(stub, async (_: OtpStore, state) => {
			const record = await state.storage.get<OtpRecord>('otp')
			if (!record) throw new Error('missing record')
			await state.storage.put('otp', {
				...record,
				expiresAt: Date.now() - 1,
			})
		})
		const response = await verify(client, id, code)
		expect(response.status).toBe(400)
		expect(await response.json()).toEqual({ error: 'Invalid or expired code.' })
	})

	it('does not let one sender lock an inbox out of codes', async () => {
		const client = createClient()
		const email = uniqueEmail()
		const attacker = uniqueIp()
		const sendFrom = (ip: string) =>
			client.request(
				'POST',
				'/email/otp',
				{ email, audience },
				{ 'CF-Connecting-IP': ip },
			)
		for (let i = 0; i < 3; i++)
			expect((await sendFrom(attacker)).status).toBe(200)
		expect((await sendFrom(attacker)).status).toBe(429)
		// The inbox's owner, on another address, still gets a code.
		expect((await sendFrom(uniqueIp())).status).toBe(200)
	})

	it('caps codes per inbox across senders at 20 an hour, except for new senders', async () => {
		const client = createClient()
		const email = uniqueEmail()
		const sendFrom = (ip: string) =>
			client.request(
				'POST',
				'/email/otp',
				{ email, audience },
				{ 'CF-Connecting-IP': ip },
			)
		// Two senders fill the inbox-wide cap.
		const attackers = [uniqueIp(), uniqueIp()]
		let sent = 0
		for (let round = 0; round < 3 && sent < 20; round++)
			for (const ip of attackers) {
				const status = (await sendFrom(ip)).status
				if (status === 200) sent++
			}
		for (let i = sent; i < 20; i++)
			expect((await sendFrom(uniqueIp())).status).toBe(200)
		// A sender that already sent is refused while the cap is full.
		const repeat = await sendFrom(attackers[0] as string)
		expect(repeat.status).toBe(429)
		expect(Number(repeat.headers.get('Retry-After'))).toBeGreaterThan(0)
		// The owner, new to the inbox, still gets one code, then waits.
		const owner = uniqueIp()
		expect((await sendFrom(owner)).status).toBe(200)
		expect((await sendFrom(owner)).status).toBe(429)
	}, 20_000)

	it('bounds codes to new senders of a full inbox at 10 an hour', async () => {
		const client = createClient()
		const email = uniqueEmail()
		const sendFrom = (ip: string) =>
			client.request(
				'POST',
				'/email/otp',
				{ email, audience },
				{ 'CF-Connecting-IP': ip },
			)
		for (let i = 0; i < 30; i++)
			expect((await sendFrom(uniqueIp())).status).toBe(200)
		const refused = await sendFrom(uniqueIp())
		expect(refused.status).toBe(429)
		expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0)
	}, 20_000)

	it('gives each sender one full-inbox exemption an hour', async () => {
		const client = createClient()
		const email = uniqueEmail()
		const sendFrom = (ip: string) =>
			client.request(
				'POST',
				'/email/otp',
				{ email, audience },
				{ 'CF-Connecting-IP': ip },
			)
		for (let i = 0; i < 20; i++)
			expect((await sendFrom(uniqueIp())).status).toBe(200)
		const sender = uniqueIp()
		expect((await sendFrom(sender)).status).toBe(200)
		// Ten minutes later the sender is no longer recent, but its hourly
		// exemption is used.
		vi.useFakeTimers({ now: Date.now() + 11 * 60 * 1000, toFake: ['Date'] })
		try {
			expect((await sendFrom(sender)).status).toBe(429)
		} finally {
			vi.useRealTimers()
		}
	}, 20_000)

	it('gives a new sender of a full inbox one code under concurrent requests', async () => {
		const client = createClient()
		const email = uniqueEmail()
		const sendFrom = (ip: string) =>
			client.request(
				'POST',
				'/email/otp',
				{ email, audience },
				{ 'CF-Connecting-IP': ip },
			)
		for (let i = 0; i < 20; i++)
			expect((await sendFrom(uniqueIp())).status).toBe(200)
		const owner = uniqueIp()
		const responses = await Promise.all([1, 2, 3].map(() => sendFrom(owner)))
		expect(responses.filter((r) => r.status === 200)).toHaveLength(1)
		// The burst used one slot of the new-sender allowance, not three.
		for (let i = 0; i < 9; i++)
			expect((await sendFrom(uniqueIp())).status).toBe(200)
		expect((await sendFrom(uniqueIp())).status).toBe(429)
	}, 20_000)

	it('burns the id after 5 failed attempts', async () => {
		const client = createClient()
		const { id, code } = await sendCode(client)
		const wrong = code === '00000000' ? '00000001' : '00000000'
		for (let i = 0; i < 5; i++)
			expect((await verify(client, id, wrong)).status).toBe(400)
		const response = await verify(client, id, code)
		expect(response.status).toBe(400)
		expect(await response.json()).toEqual({ error: 'Invalid or expired code.' })
	})
})

describe('GET /.well-known/jwks.json', () => {
	it('serves the Ed25519 public key with an RFC 7638 kid', async () => {
		const client = createClient()
		const response = await client.request('GET', '/.well-known/jwks.json')
		expect(response.status).toBe(200)
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
		const jwks = (await response.json()) as Jwks
		expect(jwks.keys).toHaveLength(1)
		const jwk = jwks.keys[0]
		expect(Object.keys(jwk ?? {}).sort()).toEqual([
			'alg',
			'crv',
			'kid',
			'kty',
			'use',
			'x',
		])
		expect(jwk).toMatchObject({
			kty: 'OKP',
			crv: 'Ed25519',
			alg: 'EdDSA',
			use: 'sig',
		})
		const expectedKid = toBase64Url(
			await sha256(`{"crv":"Ed25519","kty":"OKP","x":"${jwk?.x}"}`),
		)
		expect(jwk?.kid).toBe(expectedKid)
		const secret = JSON.parse(env.ATTESTATION_PRIVATE_KEY) as { x: string }
		expect(jwk?.x).toBe(secret.x)
	})
})

describe('service', () => {
	it('describes itself at /', async () => {
		const client = createClient()
		const response = await client.request('GET', '/')
		expect(response.status).toBe(200)
		const body = (await response.json()) as Record<string, unknown>
		expect(body.issuer).toBe('https://identity.test')
		expect(body.endpoints).toBeTruthy()
	})

	it('answers CORS preflight for any origin without credentials', async () => {
		const client = createClient()
		const response = await client.request('OPTIONS', '/email/otp', undefined, {
			Origin: 'https://merchant.example',
			'Access-Control-Request-Method': 'POST',
			'Access-Control-Request-Headers': 'content-type',
		})
		expect(response.status).toBe(204)
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
		expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
	})

	it('generates uniformly formatted codes', () => {
		for (let i = 0; i < 1000; i++) expect(generateCode()).toMatch(/^\d{8}$/)
	})
})
