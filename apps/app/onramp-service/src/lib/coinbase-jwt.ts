import * as jose from 'jose'

export type CoinbaseJwtParams = {
	keyId: string
	keySecret: string
	method: 'GET' | 'POST'
	host: string
	path: string
}

export async function createCoinbaseJwt(
	params: CoinbaseJwtParams,
): Promise<string> {
	const { keyId, keySecret, method, host, path } = params

	const now = Math.floor(Date.now() / 1000)

	const header = {
		alg: 'EdDSA' as const,
		kid: keyId,
		nonce: crypto.randomUUID(),
		typ: 'JWT',
	}

	const payload = {
		aud: ['cdp_service'],
		iss: 'cdp',
		sub: keyId,
		uris: [`${method} ${host}${path}`],
		iat: now,
		nbf: now,
		exp: now + 120,
	}

	const privateKey = await importEd25519Key(keySecret)

	return await new jose.SignJWT(payload)
		.setProtectedHeader(header)
		.sign(privateKey)
}

async function importEd25519Key(base64Secret: string): Promise<CryptoKey> {
	const keyBytes = base64ToUint8Array(base64Secret)

	if (keyBytes.length !== 64) {
		throw new Error(
			`Invalid Ed25519 key length: expected 64 bytes, got ${keyBytes.length}`,
		)
	}

	const seed = keyBytes.slice(0, 32)

	const jwk = {
		kty: 'OKP' as const,
		crv: 'Ed25519' as const,
		d: uint8ArrayToBase64Url(seed),
		x: uint8ArrayToBase64Url(keyBytes.slice(32)),
	}

	const key = await jose.importJWK(jwk, 'EdDSA')
	if (key instanceof Uint8Array) {
		throw new Error('Expected CryptoKey, got Uint8Array')
	}
	return key
}

function base64ToUint8Array(base64: string): Uint8Array {
	const binaryString = atob(base64)
	const bytes = new Uint8Array(binaryString.length)
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i)
	}
	return bytes
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
	let binary = ''
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
