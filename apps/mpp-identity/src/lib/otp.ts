import { sha256, toBase64Url } from './encoding.ts'

export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
/**
 * Digits per code. 8 rather than 6 so guessing stays impractical without a
 * per-inbox failure lock, which anyone could trigger to lock a victim out.
 */
export const CODE_DIGITS = 8

/** Uniformly random 8-digit code, using rejection sampling over 32-bit values. */
export function generateCode(): string {
	const range = 100_000_000
	// Largest multiple of `range` that fits in 2^32; values at or above it are rejected.
	const limit = Math.floor(0x1_0000_0000 / range) * range
	const buffer = new Uint32Array(1)
	while (true) {
		crypto.getRandomValues(buffer)
		const value = buffer[0] ?? limit
		if (value < limit)
			return (value % range).toString().padStart(CODE_DIGITS, '0')
	}
}

/** SHA-256(id + code), base64url. Only this hash is stored, never the code. */
export async function hashCode(id: string, code: string): Promise<string> {
	return toBase64Url(await sha256(id + code))
}

export function isCode(value: unknown): value is string {
	return typeof value === 'string' && /^\d{8}$/.test(value)
}

/** OTP ids are 16 random bytes, base64url (22 characters). */
export function isOtpId(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value)
}
