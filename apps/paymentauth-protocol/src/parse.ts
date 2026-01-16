import { decodeJson } from './encode.js'
import type {
	PaymentChallenge,
	PaymentCredential,
	PaymentReceipt,
} from './types.js'

/**
 * Parse a WWW-Authenticate header value into a PaymentChallenge.
 *
 * @example
 * ```
 * const header = 'Payment id="abc", realm="api", method="tempo", intent="charge", request="eyJ..."'
 * const challenge = parseWwwAuthenticate(header)
 * ```
 */
export function parseWwwAuthenticate<TRequest = unknown>(
	header: string,
): PaymentChallenge<TRequest> {
	if (!header.startsWith('Payment ')) {
		throw new Error(
			'Invalid WWW-Authenticate header: must start with "Payment "',
		)
	}

	const paramsString = header.slice('Payment '.length)
	const params: Record<string, string> = {}

	const regex = /(\w+)="([^"]*)"(?:,\s*)?/g
	let match: RegExpExecArray | null = regex.exec(paramsString)
	while (match !== null) {
		params[match[1]] = match[2]
		match = regex.exec(paramsString)
	}

	if (
		!params.id ||
		!params.realm ||
		!params.method ||
		!params.intent ||
		!params.request
	) {
		throw new Error(
			'Invalid WWW-Authenticate header: missing required parameters (id, realm, method, intent, request)',
		)
	}

	return {
		id: params.id,
		realm: params.realm,
		method: params.method,
		intent: params.intent,
		request: decodeJson<TRequest>(params.request),
		expires: params.expires,
		description: params.description,
	}
}

/**
 * Parse an Authorization header value into a PaymentCredential.
 *
 * @example
 * ```
 * const header = 'Payment eyJpZCI6ImFiYzEyMyIsInBheWxvYWQiOnsiLi4uIn19'
 * const credential = parseAuthorization(header)
 * ```
 */
export function parseAuthorization(header: string): PaymentCredential {
	if (!header.startsWith('Payment ')) {
		throw new Error('Invalid Authorization header: must start with "Payment "')
	}

	const token = header.slice('Payment '.length)
	return decodeJson<PaymentCredential>(token)
}

/**
 * Parse a Payment-Receipt header value into a PaymentReceipt.
 */
export function parseReceipt(header: string): PaymentReceipt {
	return decodeJson<PaymentReceipt>(header)
}
