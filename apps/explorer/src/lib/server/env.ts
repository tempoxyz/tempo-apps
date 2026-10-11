import * as z from 'zod/mini'

/**
 * Server-side environment variables available at module load time.
 * These are set via `.env` or `wrangler secret put`.
 *
 * Variables injected per-request via Cloudflare bindings (e.g. SENTRY_DSN,
 * SENTRY_TRACES_SAMPLE_RATE) are accessed via the `env` parameter in request
 * handlers and are not included here.
 */
export const serverEnvSchema = z.object({
	RPC_AUTH: z.optional(z.string()),
	PREVIEW_CHAIN_ID: z.optional(z.coerce.number().check(z.int(), z.positive())),
	PREVIEW_RPC_URL: z.optional(z.url()),
	TEMPO_API_URL: z.optional(z.url()),
	TEMPO_API_KEY: z.optional(z.string()),
	ZONE_PROVER_RPC_AUTH: z.optional(z.string()),
	ZONE_PROVER_TIDX_AUTH: z.optional(z.string()),
})

export const serverEnv = serverEnvSchema.parse(process.env)

/** Base URL for the Tempo API. */
export const tempoApiUrl = serverEnv.TEMPO_API_URL ?? 'https://api.tempo.xyz'
