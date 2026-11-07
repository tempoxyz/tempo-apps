const encoder = new TextEncoder()

/** Encodes bytes as base64url without padding. */
export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
	let binary = ''
	for (const byte of view) binary += String.fromCharCode(byte)
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decodes base64url (with or without padding) into bytes. */
export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
	const binary = atob(padded)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return bytes
}

export function utf8(value: string): Uint8Array<ArrayBuffer> {
	return new Uint8Array(encoder.encode(value))
}

export async function sha256(value: string): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(value)))
}

/** Random bytes encoded as base64url. */
export function randomId(byteLength = 16): string {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

/** Constant-time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false
	let diff = 0
	for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
	return diff === 0
}
