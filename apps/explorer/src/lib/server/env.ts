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
	TEMPO_RPC_KEY: z.optional(z.string()),
	TIDX_BASIC_AUTH: z.optional(z.string()),
})

export const serverEnv = serverEnvSchema.parse(process.env)
