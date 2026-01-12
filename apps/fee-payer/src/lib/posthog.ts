import { env } from 'cloudflare:workers'

const POSTHOG_HOST = 'https://us.i.posthog.com'

export const FeePayerEvents = {
	USAGE_QUERY: 'fee_payer.usage_query',
	SPONSORSHIP_REQUEST: 'fee_payer.sponsorship_request',
} as const

type EventProperties = Record<string, unknown>

interface CaptureParams {
	distinctId: string
	event: string
	properties?: EventProperties
}

export async function captureEvent({
	distinctId,
	event,
	properties = {},
}: CaptureParams): Promise<void> {
	if (!env.POSTHOG_API_KEY) {
		console.warn('PostHog API key not configured, skipping event capture')
		return
	}

	const payload = {
		api_key: env.POSTHOG_API_KEY,
		event,
		timestamp: new Date().toISOString(),
		properties: {
			distinct_id: distinctId,
			environment: env.TEMPO_ENV,
			...properties,
		},
	}

	try {
		const response = await fetch(`${POSTHOG_HOST}/capture/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		})

		if (!response.ok) {
			const body = await response
				.text()
				.catch(() => 'Unable to read response body')
			console.error(`PostHog capture failed: ${response.status} - ${body}`)
		}
	} catch (error) {
		console.error('PostHog capture error:', error)
	}
}

export function getRequestContext(request: Request): {
	origin: string | null
	referer: string | null
	userAgent: string | null
	serviceDomain: string
} {
	const url = new URL(request.url)
	return {
		origin: request.headers.get('origin'),
		referer: request.headers.get('referer'),
		userAgent: request.headers.get('user-agent'),
		serviceDomain: url.host,
	}
}
