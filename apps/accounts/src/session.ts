const ONE_YEAR_SECONDS = 31536000

function base64url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
	const padded = str.replace(/-/g, '+').replace(/_/g, '/')
	const binary = atob(padded)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return bytes
}

function parseJwk(jwk: string): JsonWebKey {
	const parsed = JSON.parse(jwk)
	if (parsed.alg === 'Ed25519') parsed.alg = 'EdDSA'
	return parsed
}

async function importPrivateKey(jwk: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'jwk',
		parseJwk(jwk),
		{ name: 'Ed25519' },
		false,
		['sign'],
	)
}

async function importPublicKey(jwk: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'jwk',
		parseJwk(jwk),
		{ name: 'Ed25519' },
		false,
		['verify'],
	)
}

export async function signSession(
	privateKeyJwk: string,
	userId: string,
	sessionId: string,
): Promise<string> {
	const key = await importPrivateKey(privateKeyJwk)
	const now = Math.floor(Date.now() / 1000)
	const payload = JSON.stringify({
		sub: userId,
		sid: sessionId,
		iat: now,
		exp: now + ONE_YEAR_SECONDS,
	})
	const payloadB64 = base64url(
		new TextEncoder().encode(payload).buffer as ArrayBuffer,
	)
	const signature = await crypto.subtle.sign(
		'Ed25519',
		key,
		new TextEncoder().encode(payloadB64),
	)
	return `${payloadB64}.${base64url(signature)}`
}

export async function verifySession(
	publicKeyJwk: string,
	cookie: string,
): Promise<{ sub: string; sid: string } | null> {
	try {
		const dotIndex = cookie.indexOf('.')
		if (dotIndex === -1) return null
		const payloadB64 = cookie.slice(0, dotIndex)
		const signatureB64 = cookie.slice(dotIndex + 1)
		if (!payloadB64 || !signatureB64) return null

		const key = await importPublicKey(publicKeyJwk)
		const valid = await crypto.subtle.verify(
			'Ed25519',
			key,
			base64urlDecode(signatureB64),
			new TextEncoder().encode(payloadB64),
		)
		if (!valid) return null

		const payload = JSON.parse(
			new TextDecoder().decode(base64urlDecode(payloadB64)),
		)
		if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000)
			return null

		return { sub: payload.sub, sid: payload.sid }
	} catch {
		return null
	}
}

export async function sessionCookies(
	privateKeyJwk: string,
	userId: string,
	hostname: string,
): Promise<string[]> {
	const sessionId = crypto.randomUUID()
	const token = await signSession(privateKeyJwk, userId, sessionId)

	const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'

	if (isLocal) {
		return [
			`session=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${ONE_YEAR_SECONDS}`,
		]
	}
	return [
		`__Secure-session=${token}; Domain=.tempo.xyz; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ONE_YEAR_SECONDS}`,
	]
}

export function clearSessionCookies(hostname: string): string[] {
	const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'

	if (isLocal) {
		return ['session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0']
	}
	return [
		'__Secure-session=; Domain=.tempo.xyz; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
	]
}

export async function getSessionUserId(
	request: Request,
	publicKeyJwk: string,
): Promise<string | null> {
	const cookies = request.headers.get('cookie')
	if (!cookies) return null

	let cookieValue: string | null = null
	const secureMatch = cookies.match(/(?:^|;\s*)__Secure-session=([^;]+)/)
	if (secureMatch) cookieValue = secureMatch[1]
	if (!cookieValue) {
		const hostMatch = cookies.match(/(?:^|;\s*)__Host-session=([^;]+)/)
		if (hostMatch) cookieValue = hostMatch[1]
	}
	if (!cookieValue) {
		const devMatch = cookies.match(/(?:^|;\s*)session=([^;]+)/)
		if (devMatch) cookieValue = devMatch[1]
	}
	if (!cookieValue) return null

	const result = await verifySession(publicKeyJwk, cookieValue)
	return result?.sub ?? null
}
