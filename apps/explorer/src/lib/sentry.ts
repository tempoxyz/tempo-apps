import * as Sentry from '@sentry/react'

const DEFAULT_TRACES_SAMPLE_RATE = 0.1

function getSampleRate(value: string | undefined): number {
	if (!value) return DEFAULT_TRACES_SAMPLE_RATE
	const parsed = Number.parseFloat(value)
	if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_TRACES_SAMPLE_RATE
	return Math.min(parsed, 1)
}

export function initSentry(): void {
	if (!import.meta.env.VITE_SENTRY_DSN) return

	Sentry.init({
		dsn: import.meta.env.VITE_SENTRY_DSN,
		release: __BUILD_VERSION__,
		sendDefaultPii: false,
		beforeSend: (event) => {
			if (event.request?.url) {
				try {
					const url = new URL(event.request.url)
					for (const param of ['auth', 'token', 'apikey', 'api_key', 'key']) {
						url.searchParams.delete(param)
					}
					event.request.url = url.toString()
				} catch {
					// Ignore invalid URLs and leave the original value in place.
				}
			}
			return event
		},
		tracesSampleRate: getSampleRate(
			import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
		),
		integrations: [Sentry.browserTracingIntegration()],
		tracePropagationTargets: [/^\//, /tempo\.xyz/],
	})
}
