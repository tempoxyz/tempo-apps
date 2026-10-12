import * as z from 'zod/mini'

/**
 * Server-side environment variables available at module load time.
 * These are set via `.env` or `wrangler secret put`.
 *
 * Variables injected per-request via Cloudflare bindings (e.g. SENTRY_DSN,
 * SENTRY_TRACES_SAMPLE_RATE) are accessed via the `env` parameter in request
 * handlers and are not included here.
 *
 * `DEVNET_*` credentials go with the `devnet` build's backend overrides (see
 * `devnetUrls`). Other builds ignore them.
 */
export const serverEnvSchema = z.object({
	DEVNET_API_ACCESS_CLIENT_ID: z.optional(z.string()),
	DEVNET_API_ACCESS_CLIENT_SECRET: z.optional(z.string()),
	DEVNET_RPC_AUTH: z.optional(z.string()),
	DEVNET_TIDX_AUTH: z.optional(z.string()),
	RPC_AUTH: z.optional(z.string()),
	TEMPO_API_KEY: z.optional(z.string()),
	ZONE_PROVER_RPC_AUTH: z.optional(z.string()),
	ZONE_PROVER_TIDX_AUTH: z.optional(z.string()),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

export const serverEnv = serverEnvSchema.parse(process.env)

/**
 * Backends that point a `devnet` build at another chain-31318 devnet, such as
 * a per-devnet preview. They are compiled in from the build's own
 * configuration (see vite.config.ts) and never read from runtime Worker vars:
 * `keep_vars` carries a var from one uploaded version into the next, so one
 * preview's override would otherwise reach every later version.
 */
export const devnetUrls: DevnetUrls = {
	DEVNET_API_URL: import.meta.env.DEVNET_API_URL || undefined,
	DEVNET_RPC_URL: import.meta.env.DEVNET_RPC_URL || undefined,
	DEVNET_TIDX_URL: import.meta.env.DEVNET_TIDX_URL || undefined,
}

export type DevnetUrls = {
	DEVNET_API_URL?: string | undefined
	DEVNET_RPC_URL?: string | undefined
	DEVNET_TIDX_URL?: string | undefined
}

/**
 * The Tempo API the server calls and the headers it sends there.
 *
 * A `devnet` build with `DEVNET_API_URL` calls that API instead. It never
 * receives the production `TEMPO_API_KEY`; Cloudflare Access service-token
 * headers are sent when both `DEVNET_API_ACCESS_*` values are set.
 */
export function resolveTempoApi(
	env: ServerEnv & Pick<DevnetUrls, 'DEVNET_API_URL'>,
	tempoEnv: string | undefined,
): resolveTempoApi.ReturnType {
	if (tempoEnv === 'devnet' && env.DEVNET_API_URL)
		return {
			url: env.DEVNET_API_URL.replace(/\/+$/, ''),
			headers:
				env.DEVNET_API_ACCESS_CLIENT_ID && env.DEVNET_API_ACCESS_CLIENT_SECRET
					? {
							'CF-Access-Client-Id': env.DEVNET_API_ACCESS_CLIENT_ID,
							'CF-Access-Client-Secret': env.DEVNET_API_ACCESS_CLIENT_SECRET,
						}
					: undefined,
		}
	return {
		url: 'https://api.tempo.xyz',
		headers: env.TEMPO_API_KEY
			? { 'tempo-api-key': env.TEMPO_API_KEY }
			: undefined,
	}
}

export declare namespace resolveTempoApi {
	type ReturnType = {
		url: string
		headers: Record<string, string> | undefined
	}
}

export const tempoApi = resolveTempoApi(
	{ ...serverEnv, DEVNET_API_URL: devnetUrls.DEVNET_API_URL },
	import.meta.env.VITE_TEMPO_ENV,
)

/** Base URL for the Tempo API. */
export const tempoApiUrl = tempoApi.url
