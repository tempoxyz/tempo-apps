import * as z from 'zod/mini'

const ServerEnvSchema = z.object({
	INDEXSUPPLY_API_KEY: z.string(),
	INDEXSUPPLY_ENDPOINT: z.prefault(
		z.url(),
		'https://api.indexsupply.net/v2/query',
	),
})

const ClientEnvSchema = z.object({
	VITE_ENABLE_COLOR_SCHEME_TOGGLE: z.prefault(z.coerce.boolean(), false),
	VITE_ENABLE_ERUDA: z.prefault(z.coerce.boolean(), false),
})

export const server = ServerEnvSchema.parse(process.env)

export const client = ClientEnvSchema.parse(import.meta.env)

export const env = { server, client }
