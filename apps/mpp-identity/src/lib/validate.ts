const EMAIL_PATTERN =
	/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

/**
 * Normalizes (trim + lowercase) and validates an email address.
 * Returns undefined when the input is not a simple, single-recipient address.
 */
export function normalizeEmail(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const email = value.trim().toLowerCase()
	if (email.length === 0 || email.length > 254) return undefined
	if (!EMAIL_PATTERN.test(email)) return undefined
	return email
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * Validates an audience: it must be a bare origin (an optional trailing slash
 * is removed), https only, except http://localhost and http://127.0.0.1.
 * Returns the origin, which becomes the attestation's `aud`.
 */
export function normalizeAudience(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.length > 2048) return undefined
	const input = value.endsWith('/') ? value.slice(0, -1) : value
	let url: URL
	try {
		url = new URL(value)
	} catch {
		return undefined
	}
	if (url.origin !== input) return undefined
	if (url.protocol === 'https:')
		return isDnsName(url.hostname) ? url.origin : undefined
	if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
		return url.origin
	return undefined
}

/**
 * A DNS host name: letters, digits and hyphens in labels of up to 63
 * characters, at most 253 in all. The audience is shown in the email, so it
 * cannot carry punctuation or overlong text.
 */
function isDnsName(host: string): boolean {
	if (host.length > 253) return false
	return host
		.split('.')
		.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}
