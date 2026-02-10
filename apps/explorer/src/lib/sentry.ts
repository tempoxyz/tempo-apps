import * as Sentry from '@sentry/react'

const DEFAULT_TRACES_SAMPLE_RATE = 0.1

function getSampleRate(value: string | undefined): number {
	if (!value) return DEFAULT_TRACES_SAMPLE_RATE
	const parsed = Number.parseFloat(value)
	if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_TRACES_SAMPLE_RATE
	return Math.min(parsed, 1)
}

const SENTRY_DSN =
	'https://0f252c4cc335811d53f9e996b8a3450a@o4510262603481088.ingest.us.sentry.io/4510858114564096'

export function initSentry(
	router: Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0],
): void {
	Sentry.init({
		dsn: SENTRY_DSN,
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
		integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
		environment: import.meta.env.DEV ? 'local' : undefined,
		tracePropagationTargets: [/^\//, /localhost/, /tempo\.xyz/],
	})
}
