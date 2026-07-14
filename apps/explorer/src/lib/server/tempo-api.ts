import type * as cadent from 'cadent'
import { hc } from 'hono/client'
import { serverEnv, tempoApiUrl } from './env.ts'

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
	headers: serverEnv.TEMPO_API_KEY
		? { 'tempo-api-key': serverEnv.TEMPO_API_KEY }
		: undefined,
})
