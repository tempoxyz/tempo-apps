import type * as cadent from 'cadent'
import * as Sentry from '@sentry/cloudflare'
import { hc } from 'hono/client'
import { serverEnv, tempoApiUrl } from './env.ts'

const ALERTABLE_STATUSES = new Set([402, 403, 429])
const REPORT_THROTTLE_MS = 60_000
const lastReportedAt = new Map<string, number>()

export function isAlertableTempoApiStatus(status: number): boolean {
	return ALERTABLE_STATUSES.has(status) || status >= 500
}

function reportTempoApiResponse(response: Response, method: string): void {
	if (!isAlertableTempoApiStatus(response.status)) return

	const url = new URL(response.url)
	const key = `${response.status}:${method}:${url.pathname}`
	const now = Date.now()
	const previous = lastReportedAt.get(key) ?? 0

	console.error('[tempo-api] upstream request failed', {
		method,
		path: url.pathname,
		status: response.status,
	})

	if (now - previous < REPORT_THROTTLE_MS) return
	lastReportedAt.set(key, now)

	Sentry.captureMessage(`Tempo API returned ${response.status}`, {
		level: 'error',
		tags: {
			component: 'tempo-api-client',
			method,
			path: url.pathname,
			status: String(response.status),
		},
	})
}

const instrumentedFetch: typeof fetch = async (input, init) => {
	const response = await fetch(input, init)
	const method =
		init?.method ?? (input instanceof Request ? input.method : 'GET')
	reportTempoApiResponse(response, method)
	return response
}

/**
 * Typed client for the Tempo API. Server-side only.
 *
 * Built with hono's `hc` + the API's `App` type (instead of its
 * `Client.create`) so the package stays a type-only import: its runtime barrel
 * pulls the whole API server, including Node-only transitive dependencies
 * that can't load in the Workers runtime.
 *
 * Consume with hono's `parseResponse` (throws on non-2xx, returns the typed
 * success body), or narrow manually with `response.status === 200`.
 *
 * Anonymous requests are rate-limited; deployments set `TEMPO_API_KEY`
 * (scopes: `data:read`, `indexer:query`).
 */
export const api = hc<cadent.App.App>(tempoApiUrl, {
	fetch: instrumentedFetch,
	headers: serverEnv.TEMPO_API_KEY
		? { 'tempo-api-key': serverEnv.TEMPO_API_KEY }
		: undefined,
})
