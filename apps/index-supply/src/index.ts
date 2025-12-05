import { env } from 'cloudflare:workers'
import { zValidator as zv } from '@hono/zod-validator'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import * as z from 'zod/mini'
import { app } from '#setup.ts'

/**
 * A Cloudflare Worker proxying requests to https://api.indexsupply.net/v2/query
 *
 * @see:
 * - docs: https://indexsupply.net/docs
 */

const INDEX_SUPPLY_URL = 'https://api.indexsupply.net/v2/query'

const IndexSupplyApiKeySchema = z.prefault(z.string(), env.INDEXSUPPLY_API_KEY)

// TODO: make more strict
const _ResponseSchema = z.array(
	z.object({
		cursor: z.string(),
		columns: z.array(z.object({ name: z.string(), pgtype: z.string() })),
		rows: z.array(z.array(z.string())),
	}),
)

const GETQuerySchema = z.object({
	'api-key': IndexSupplyApiKeySchema,
	query: z.string(),
	signatures: z.string(),
	cursor: z.optional(z.string()),
})

app.get(
	'/',
	zv('query', GETQuerySchema, (result, context) => {
		if (!result.success)
			return context.json({ error: result.error.message }, 400)
	}),
	async (context) => {
		const params = context.req.valid('query')

		const indexSupplyUrl = new URL(INDEX_SUPPLY_URL)
		const searchParams = new URLSearchParams({
			'api-key': params['api-key'],
			query: params.query,
			signatures: params.signatures,
		})

		const response = await fetch(`${indexSupplyUrl}?${searchParams}`, {
			method: 'GET',
		})

		if (!response.ok)
			return context.json(
				{
					error: (await response.text()) ?? 'Failed to fetch from IndexSupply',
				},
				response.status as ContentfulStatusCode,
			)

		const data = await response.json()
		return context.json(data)
	},
)

const POSTQuerySchema = z.object({
	query: z.string(),
	signatures: z.array(z.string()),
	cursor: z.optional(z.string()),
})

app.post(
	'/',
	zv('json', POSTQuerySchema, (result, context) => {
		if (!result.success)
			return context.json({ error: result.error.message }, 400)
	}),
	async (context) => {
		const key = context.req.query('api-key') ?? context.env.INDEXSUPPLY_API_KEY
		if (!key) return context.json({ error: 'api-key is required' }, 400)

		const params = context.req.valid('json')

		const response = await fetch(INDEX_SUPPLY_URL, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify([
				{
					cursor: params.cursor,
					signatures: params.signatures,
					query: params.query,
				},
			]),
		})

		if (!response.ok)
			return context.json(
				{
					error: (await response.text()) ?? 'Failed to fetch from IndexSupply',
				},
				response.status as ContentfulStatusCode,
			)

		const data = await response.json()
		return context.json(data)
	},
)

export default app satisfies ExportedHandler<Cloudflare.Env>
