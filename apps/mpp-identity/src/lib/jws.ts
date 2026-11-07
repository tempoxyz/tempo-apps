import { sha256, toBase64Url, utf8 } from './encoding.ts'

export const ATTESTATION_TYP = 'mpp-attestation+jwt'

export type PublicJwk = {
	kty: 'OKP'
	crv: 'Ed25519'
	x: string
	kid: string
	alg: 'EdDSA'
	use: 'sig'
}

export type AttestationPayload = {
	iss: string
	aud: string
	sub: string
	type: 'email'
	iat: number
	exp: number
	jti: string
}

export type SigningKey = {
	privateKey: CryptoKey
	publicJwk: PublicJwk
}

type PrivateJwk = { kty?: string; crv?: string; d?: string; x?: string }

/** RFC 7638 SHA-256 thumbprint of an Ed25519 public key, base64url. */
export async function thumbprint(x: string): Promise<string> {
	// Required members only, in lexicographic order, no whitespace.
	return toBase64Url(
		await sha256(JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x })),
	)
}

const cache = new Map<string, Promise<SigningKey>>()

/** Imports the Ed25519 private JWK from ATTESTATION_PRIVATE_KEY (cached per value). */
export function loadSigningKey(
	secret: string | undefined,
): Promise<SigningKey> {
	if (!secret) throw new Error('ATTESTATION_PRIVATE_KEY is not set')
	let key = cache.get(secret)
	if (!key) {
		key = importSigningKey(secret)
		key.catch(() => cache.delete(secret))
		cache.set(secret, key)
	}
	return key
}

async function importSigningKey(secret: string): Promise<SigningKey> {
	const jwk = JSON.parse(secret) as PrivateJwk
	if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.d || !jwk.x)
		throw new Error('ATTESTATION_PRIVATE_KEY must be an Ed25519 private JWK')
	const privateKey = await crypto.subtle.importKey(
		'jwk',
		{ kty: 'OKP', crv: 'Ed25519', d: jwk.d, x: jwk.x },
		{ name: 'Ed25519' },
		false,
		['sign'],
	)
	return {
		privateKey,
		publicJwk: {
			kty: 'OKP',
			crv: 'Ed25519',
			x: jwk.x,
			kid: await thumbprint(jwk.x),
			alg: 'EdDSA',
			use: 'sig',
		},
	}
}

/** Signs a compact JWS (EdDSA over Ed25519). */
export async function signAttestation(
	key: SigningKey,
	payload: AttestationPayload,
): Promise<string> {
	const header = { alg: 'EdDSA', typ: ATTESTATION_TYP, kid: key.publicJwk.kid }
	const signingInput = `${toBase64Url(utf8(JSON.stringify(header)))}.${toBase64Url(utf8(JSON.stringify(payload)))}`
	const signature = await crypto.subtle.sign(
		{ name: 'Ed25519' },
		key.privateKey,
		utf8(signingInput),
	)
	return `${signingInput}.${toBase64Url(signature)}`
}
