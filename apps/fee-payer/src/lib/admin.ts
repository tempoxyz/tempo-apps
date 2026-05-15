import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import * as z from 'zod'
import {
	createApiKey,
	listApiKeys,
	revokeApiKey,
	updateApiKey,
} from './api-keys.js'

const admin = new Hono()

/** Verify the request carries the correct admin secret. */
admin.use('*', async (c, next) => {
	const auth = c.req.header('Authorization')
	if (!auth || auth !== `Bearer ${env.ADMIN_SECRET}`) {
		return c.json({ error: 'Unauthorized' }, 401)
	}
	await next()
})

/** POST /admin/keys — create a new API key. */
admin.post(
	'/keys',
	zValidator(
		'json',
		z.object({
			label: z.string(),
			dailyLimitUsd: z.string().nullable().optional().default(null),
			allowedDestinations: z.array(z.string()).optional().default([]),
		}),
	),
	async (c) => {
		const body = c.req.valid('json')
		const key = await createApiKey({
			label: body.label,
			dailyLimitUsd: body.dailyLimitUsd,
			allowedDestinations: body.allowedDestinations,
		})
		return c.json({ key }, 201)
	},
)

/** GET /admin/keys — list all API keys. */
admin.get('/keys', async (c) => {
	const cursor = c.req.query('cursor') ?? undefined
	const result = await listApiKeys(cursor)
	return c.json(result)
})

/** PATCH /admin/keys/:key — update an API key. */
admin.patch(
	'/keys/:key',
	zValidator(
		'json',
		z.object({
			label: z.string().optional(),
			dailyLimitUsd: z.string().nullable().optional(),
			allowedDestinations: z.array(z.string()).optional(),
			active: z.boolean().optional(),
		}),
	),
	async (c) => {
		const key = c.req.param('key')
		const body = c.req.valid('json')
		const ok = await updateApiKey(key, body)
		if (!ok) return c.json({ error: 'Key not found' }, 404)
		return c.json({ ok: true })
	},
)

/** DELETE /admin/keys/:key — revoke an API key. */
admin.delete('/keys/:key', async (c) => {
	const key = c.req.param('key')
	const ok = await revokeApiKey(key)
	if (!ok) return c.json({ error: 'Key not found' }, 404)
	return c.json({ ok: true })
})

export { admin }
