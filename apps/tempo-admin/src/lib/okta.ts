import { env } from 'cloudflare:workers'
import type { Context, Next } from 'hono'
import { createMiddleware } from 'hono/factory'

type JwksKey = {
	kty: string
	kid: string
	use: string
	alg: string
	n: string
	e: string
}

type JwksResponse = {
	keys: JwksKey[]
}

type OktaClaims = {
	sub: string
	email: string
	iss: string
	aud: string
	exp: number
	iat: number
}

let jwksCache: { keys: JwksKey[]; fetchedAt: number } | undefined

async function getJwks(): Promise<JwksKey[]> {
	const now = Date.now()
	if (jwksCache && now - jwksCache.fetchedAt < 3600_000) {
		return jwksCache.keys
	}

	const response = await fetch(`${env.OKTA_ISSUER}/v1/keys`)
	if (!response.ok) {
		throw new Error(`Failed to fetch JWKS: ${response.status}`)
	}

	const data = (await response.json()) as JwksResponse
	jwksCache = { keys: data.keys, fetchedAt: now }
	return data.keys
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
	const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
	const padded = base64.padEnd(
		base64.length + ((4 - (base64.length % 4)) % 4),
		'=',
	)
	const binary = atob(padded)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes.buffer
}

async function importJwk(jwk: JwksKey): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'jwk',
		{ kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg, ext: true },
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['verify'],
	)
}

async function verifyOktaToken(token: string): Promise<OktaClaims> {
	const parts = token.split('.')
	if (parts.length !== 3) {
		throw new Error('Invalid JWT format')
	}

	const [headerB64, payloadB64, signatureB64] = parts
	const header = JSON.parse(
		new TextDecoder().decode(base64UrlToArrayBuffer(headerB64)),
	) as {
		kid: string
		alg: string
	}

	if (header.alg !== 'RS256') {
		throw new Error('Unsupported algorithm')
	}

	const keys = await getJwks()
	const key = keys.find((k) => k.kid === header.kid)
	if (!key) {
		throw new Error('No matching key found in JWKS')
	}

	const cryptoKey = await importJwk(key)
	const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
	const signature = base64UrlToArrayBuffer(signatureB64)

	const valid = await crypto.subtle.verify(
		'RSASSA-PKCS1-v1_5',
		cryptoKey,
		signature,
		data,
	)
	if (!valid) {
		throw new Error('Invalid token signature')
	}

	const payload = JSON.parse(
		new TextDecoder().decode(base64UrlToArrayBuffer(payloadB64)),
	) as OktaClaims

	const now = Math.floor(Date.now() / 1000)
	if (payload.exp < now) {
		throw new Error('Token expired')
	}

	if (payload.iss !== env.OKTA_ISSUER) {
		throw new Error('Invalid issuer')
	}

	if (payload.aud !== env.OKTA_CLIENT_ID) {
		throw new Error('Invalid audience')
	}

	return payload
}

export type OktaUser = {
	email: string
	sub: string
}

export const oktaAuth = createMiddleware<{
	Variables: { user: OktaUser }
}>(async (c: Context, next: Next) => {
	const authHeader = c.req.header('Authorization')
	if (!authHeader?.startsWith('Bearer ')) {
		return c.json({ error: 'Missing or invalid Authorization header' }, 401)
	}

	const token = authHeader.slice(7)

	try {
		const claims = await verifyOktaToken(token)
		if (!claims.email) {
			return c.json({ error: 'Token missing email claim' }, 401)
		}
		c.set('user', { email: claims.email, sub: claims.sub })
		await next()
	} catch {
		return c.json({ error: 'Authentication failed' }, 401)
	}
})
