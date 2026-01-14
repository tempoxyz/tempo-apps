import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getAddress } from 'viem'
import * as z from 'zod'
import { createOnrampOrder } from './lib/coinbase-api.js'

const app = new Hono()

app.use(
	'*',
	cors({
		origin: (origin) => {
			if (env.ENVIRONMENT === 'local') return origin ?? '*'
			if (env.ALLOWED_ORIGINS === '*') return '*'
			if (origin && env.ALLOWED_ORIGINS.includes(origin)) return origin
			return null
		},
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		maxAge: 86400,
	}),
)

app.get('/health', (c) => c.json({ ok: true }))

app.get('/status/:address', (c) => {
	return c.json({ eligible: true })
})

const createOrderSchema = z.object({
	address: z
		.string()
		.regex(/^0x[a-fA-F0-9]{40}$/)
		.transform((v) => getAddress(v)),
	amount: z.number().min(5).max(10000),
	email: z.string().email().optional(),
	phoneNumber: z.string().min(10).optional(),
	phoneNumberVerifiedAt: z.string().datetime().optional(),
})

app.post('/orders', zValidator('json', createOrderSchema), async (c) => {
	const { address, amount, email, phoneNumber, phoneNumberVerifiedAt } =
		c.req.valid('json')

	const domain = env.APP_DOMAIN

	if (!env.CB_API_KEY_ID || !env.CB_API_KEY_SECRET) {
		return c.json({ error: 'Coinbase API credentials not configured' }, 500)
	}

	const sandbox = env.ENVIRONMENT === 'local'

	const result = await createOnrampOrder({
		keyId: env.CB_API_KEY_ID,
		keySecret: env.CB_API_KEY_SECRET,
		destinationAddress: address,
		destinationNetwork: 'base',
		domain,
		email: email ?? `${address.slice(0, 10)}@tempo.xyz`,
		phoneNumber: phoneNumber ?? '+17144689531',
		phoneNumberVerifiedAt: phoneNumberVerifiedAt ?? new Date().toISOString(),
		purchaseAmount: amount.toFixed(2),
		sandbox,
	})

	console.log('Created onramp order:', result.orderId)

	return c.json(result)
})

export default app
