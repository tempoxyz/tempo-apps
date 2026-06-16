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
	TEMPO_API_KEY: z.optional(z.string()),
	TEMPO_API_URL: z.url(),
})

type ServerEnv = z.infer<typeof serverEnvSchema>

/**
 * Lazily validated server env. The parse must NOT run at module load: this
 * module is pulled into the client bundle via `wagmi.config.ts` (its
 * `.server()` closures reference `serverEnv`), and an eager top-level
 * `parse(process.env)` throws a `ZodError` in the browser — where
 * `TEMPO_API_URL` is undefined — crashing hydration before any query fires.
 *
 * The Proxy defers validation to first property access, which only happens in
 * server-only code paths (the `.server()` closures are stripped from the
 * client build), so the browser never triggers it.
 */
let cachedServerEnv: ServerEnv | undefined
export const serverEnv = new Proxy({} as ServerEnv, {
	get(_target, prop: string) {
		cachedServerEnv ??= serverEnvSchema.parse(process.env)
		return cachedServerEnv[prop as keyof ServerEnv]
	},
})
