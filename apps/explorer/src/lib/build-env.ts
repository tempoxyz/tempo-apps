import * as z from 'zod/mini'

const enabledSchema = z.stringbool()

const canonicalTempoEnvSchema = z.union([
	z.literal('devnet'),
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
	VITE_ENABLE_DEVTOOLS: z.prefault(enabledSchema, 'false'),
	VITE_TEMPO_ENV: tempoEnvSchema,
})
