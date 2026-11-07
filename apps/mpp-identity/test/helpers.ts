import { createExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import worker from '../src/index.ts'
import { fromBase64Url } from '../src/lib/encoding.ts'

export type SentEmail = EmailMessageBuilder

let ipCounter = 0

/** A fresh client IP per call, so tests don't share the per-IP rate limit. */
export function uniqueIp(): string {
	ipCounter++
	return `10.${Math.floor(Math.random() * 250)}.${ipCounter >> 8}.${ipCounter & 255}`
}

export function uniqueEmail(): string {
	// A fresh domain too, so tests don't share the per-domain limit.
	return `user@${crypto.randomUUID()}.example.com`
}

/** Calls the worker with a mocked EMAIL binding that records sent messages. */
export function createClient(options: { failSend?: boolean } = {}) {
	const sent: SentEmail[] = []
	const testEnv = {
		...env,
		EMAIL: {
			async send(message: EmailMessageBuilder) {
				if (options.failSend) throw new Error('send failed')
				sent.push(message)
				return { messageId: 'test' }
			},
		} as unknown as SendEmail,
	}

	async function request(
		method: string,
		path: string,
		body?: unknown,
		headers: Record<string, string> = {},
	): Promise<Response> {
		return worker.fetch(
			new Request(`https://identity.test${path}`, {
				method,
				headers: {
					'Content-Type': 'application/json',
					'CF-Connecting-IP': uniqueIp(),
					...headers,
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
			testEnv,
			createExecutionContext(),
		)
	}

	return { sent, request, env: testEnv }
}

export function codeFrom(email: SentEmail | undefined): string {
	const match = email?.text?.match(/\b(\d{6})\b/)
	if (!match?.[1]) throw new Error('no code in email')
	return match[1]
}

export function decodeJson(segment: string): Record<string, unknown> {
	return JSON.parse(new TextDecoder().decode(fromBase64Url(segment)))
}
