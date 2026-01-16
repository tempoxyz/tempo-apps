/// <reference types="@cloudflare/workers-types" />

interface Env {
	// Environment variables from wrangler.jsonc
	TEMPO_RPC_URL: string
	TEMPO_ENV: string
	ALLOWED_ORIGINS: string

	// Secrets (set via `wrangler secret put`)
	// SPONSOR_PRIVATE_KEY?: string
	// API_KEY?: string

	// Bindings (uncomment as needed)
	// DB: D1Database
	// BUCKET: R2Bucket
	// KV: KVNamespace
	// RateLimiter: RateLimit
}

declare module 'cloudflare:workers' {
	interface Cloudflare {
		env: Env
	}
	export const env: Env
}
