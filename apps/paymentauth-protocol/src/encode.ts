import type {
	PaymentChallenge,
	PaymentCredential,
	PaymentReceipt,
} from './types.js'

/**
 * Encode a string to base64url (no padding).
 */
export function base64urlEncode(input: string): string {
	const base64 = btoa(input)
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decode a base64url string.
 */
export function base64urlDecode(input: string): string {
	let base64 = input.replace(/-/g, '+').replace(/_/g, '/')
	const padding = base64.length % 4
	if (padding) {
		base64 += '='.repeat(4 - padding)
	}
	return atob(base64)
}

/**
 * Encode an object to base64url JSON.
 */
function encodeJson<T>(obj: T): string {
	return base64urlEncode(JSON.stringify(obj))
}

/**
 * Decode a base64url JSON string to an object.
 */
export function decodeJson<T>(encoded: string): T {
	return JSON.parse(base64urlDecode(encoded)) as T
}

/**
 * Generate a cryptographically random challenge ID (128+ bits entropy).
 */
export function generateChallengeId(): string {
	const bytes = new Uint8Array(16) // 128 bits
	crypto.getRandomValues(bytes)
	return base64urlEncode(String.fromCharCode(...bytes))
}

/**
 * Format a payment challenge as a WWW-Authenticate header value.
 *
 * @example
 * ```
 * Payment id="abc123", realm="api.example.com", method="tempo", intent="charge", request="eyJ..."
 * ```
 */
export function formatWwwAuthenticate<T>(
	challenge: PaymentChallenge<T>,
): string {
	const parts: string[] = ['Payment']

	const params: string[] = [
		`id="${challenge.id}"`,
		`realm="${challenge.realm}"`,
		`method="${challenge.method}"`,
		`intent="${challenge.intent}"`,
		`request="${encodeJson(challenge.request)}"`,
	]

	if (challenge.expires) {
		params.push(`expires="${challenge.expires}"`)
	}

	if (challenge.description) {
		params.push(`description="${challenge.description}"`)
	}

	parts.push(params.join(', '))
	return parts.join(' ')
}

/**
 * Format a payment credential as an Authorization header value.
 *
 * @example
 * ```
 * Payment eyJpZCI6ImFiYzEyMyIsInBheWxvYWQiOnsiLi4uIn19
 * ```
 */
export function formatAuthorization(credential: PaymentCredential): string {
	return `Payment ${encodeJson(credential)}`
}

/**
 * Format a payment receipt as a Payment-Receipt header value.
 */
export function formatReceipt(receipt: PaymentReceipt): string {
	return encodeJson(receipt)
}
