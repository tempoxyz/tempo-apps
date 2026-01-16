import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import * as z from 'zod'
import { getTempoClient } from '#lib/tempo.js'

const app = new Hono()

// CORS middleware
app.use(
	'*',
	cors({
		origin: (origin) => {
			if (env.ALLOWED_ORIGINS === '*') return '*'
			if (origin && env.ALLOWED_ORIGINS.includes(origin)) return origin
			return null
		},
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization'],
		maxAge: 86400,
	}),
)

// Health check
app.get('/health', (c) => c.json({ ok: true, env: env.TEMPO_ENV }))

// Example: Get balance for an address
const balanceSchema = z.object({
	address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
})

app.get('/api/balance/:address', zValidator('param', balanceSchema), async (c) => {
	const { address } = c.req.valid('param')
	const client = getTempoClient()

	const balance = await client.getBalance({ address: address as `0x${string}` })

	return c.json({
		address,
		balance: balance.toString(),
		formatted: (Number(balance) / 1e6).toFixed(2),
	})
})

// Example: Get recent transfers using IDXS
app.get('/api/transfers', async (c) => {
	const { getTransfers } = await import('#lib/idxs.js')
	const transfers = await getTransfers({ limit: 20 })
	return c.json({ transfers })
})

// Uncomment for scheduled tasks (cron triggers)
// export default {
// 	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
// 		return app.fetch(request, env, ctx)
// 	},
// 	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
// 		// Run periodic tasks here
// 		console.log('Cron triggered:', event.cron)
// 	},
// }

export default app
