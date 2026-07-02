import * as z from 'zod/mini'

const enabledSchema = z.stringbool()

const canonicalTempoEnvSchema = z.union([
	z.literal('devnet'),
	z.literal('localnet'),
	z.literal('nextfork'),
	z.literal('testnet'),
	z.literal('mainnet'),
])

export const tempoEnvSchema = z.prefault(
	z.pipe(
		z.pipe(
			z.string(),
			z.transform((value) =>
				value === 'moderato'
					? 'testnet'
					: value === 'presto'
						? 'mainnet'
						: value,
			),
		),
		canonicalTempoEnvSchema,
	),
	'testnet',
)

export const buildEnvSchema = z.object({
	ALLOWED_HOSTS: z.prefault(
		z.pipe(
			z.string(),
			z.transform((x) => x.split(',').filter(Boolean)),
		),
		'',
	),
	ANALYZE: z.prefault(enabledSchema, 'false'),
	ANALYZE_JSON: z.prefault(enabledSchema, 'false'),
	CF_PAGES_COMMIT_SHA: z.optional(z.string()),
	CLOUDFLARE_ENV: tempoEnvSchema,
	NODE_ENV: z.prefault(z.string(), 'development'),
	PORT: z.prefault(z.coerce.number(), 3_007),
	SENTRY_AUTH_TOKEN: z.optional(z.string()),
	SENTRY_ORG: z.optional(z.string()),
	SENTRY_PROJECT: z.optional(z.string()),
	VITE_BASE_URL: z.prefault(z.string(), ''),
	VITE_DATADOG_ALLOWED_TRACING_URLS: z.prefault(z.string(), ''),
	VITE_DATADOG_ENABLED: z.prefault(enabledSchema, 'false'),
	VITE_DATADOG_ENV: z.optional(z.string()),
	VITE_DATADOG_SERVICE: z.prefault(z.string(), 'explorer'),
	VITE_DATADOG_SESSION_REPLAY_SAMPLE_RATE: z.prefault(z.string(), '0'),
	VITE_DATADOG_SESSION_SAMPLE_RATE: z.prefault(z.string(), '100'),
	VITE_DATADOG_TRACE_SAMPLE_RATE: z.prefault(z.string(), '20'),
	VITE_ENABLE_DEVTOOLS: z.prefault(enabledSchema, 'false'),
	VITE_TEMPO_CHAIN_ID: z.prefault(z.coerce.number(), 31_337),
	VITE_TEMPO_ENV: tempoEnvSchema,
	VITE_TEMPO_RPC_URL: z.prefault(z.string(), 'http://127.0.0.1:8545'),
})
