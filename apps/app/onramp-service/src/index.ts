import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { type Address, getAddress } from 'viem'
import * as z from 'zod'
import { createOnrampOrder } from './lib/coinbase-api.js'
import { createPaymentIntent } from './lib/stripe-api.js'
import {
	extractChargeMetadata,
	extractPaymentMetadata,
	getChargeAmountInDollars,
	parseStripeEvent,
	verifyStripeSignature,
} from './lib/stripe-webhook.js'
import {
	type Environment,
	type IdempotencyStore,
	processWithIdempotency,
	sendTestnetFunds,
} from './lib/testnet-funds.js'

type Bindings = {
	STRIPE_IDEMPOTENCY: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

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

const stripePaymentIntentSchema = z.object({
	address: z
		.string()
		.regex(/^0x[a-fA-F0-9]{40}$/)
		.transform((v) => getAddress(v)),
	amount: z.number().min(5).max(10000),
	email: z.string().email().optional(),
})

app.get('/stripe/config', (c) => {
	console.log('[Stripe] GET /stripe/config')
	if (!env.STRIPE_PUBLISHABLE_KEY) {
		console.error('[Stripe] Publishable key not configured')
		return c.json({ error: 'Stripe not configured' }, 500)
	}
	console.log('[Stripe] Returning publishable key')
	return c.json({ publishableKey: env.STRIPE_PUBLISHABLE_KEY })
})

app.post(
	'/stripe/payment-intents',
	zValidator('json', stripePaymentIntentSchema),
	async (c) => {
		const { address, amount, email } = c.req.valid('json')

		console.log('[Stripe] POST /stripe/payment-intents', {
			address,
			amount,
			email,
		})

		if (!env.STRIPE_SECRET_KEY) {
			console.error('[Stripe] Secret key not configured')
			return c.json({ error: 'Stripe API credentials not configured' }, 500)
		}

		try {
			const result = await createPaymentIntent({
				secretKey: env.STRIPE_SECRET_KEY,
				destinationAddress: address,
				amount,
				email,
				environment: env.ENVIRONMENT,
			})

			console.log('[Stripe] PaymentIntent created successfully:', {
				paymentIntentId: result.paymentIntentId,
				amount: result.amount,
			})

			return c.json(result)
		} catch (error) {
			console.error('[Stripe] PaymentIntent creation failed:', error)
			throw error
		}
	},
)

app.post('/stripe/webhooks', async (c) => {
	console.log('[Stripe Webhook] POST /stripe/webhooks')

	if (!env.STRIPE_WEBHOOK_SECRET) {
		console.error('[Stripe Webhook] Webhook secret not configured')
		return c.json({ error: 'Webhook secret not configured' }, 500)
	}

	const signature = c.req.header('stripe-signature')
	if (!signature) {
		console.error('[Stripe Webhook] Missing stripe-signature header')
		return c.json({ error: 'Missing signature' }, 400)
	}

	const payload = await c.req.text()
	console.log('[Stripe Webhook] Received payload length:', payload.length)

	const isValid = await verifyStripeSignature(
		payload,
		signature,
		env.STRIPE_WEBHOOK_SECRET,
	)

	if (!isValid) {
		console.error('[Stripe Webhook] Invalid signature')
		return c.json({ error: 'Invalid signature' }, 400)
	}

	const event = parseStripeEvent(payload)
	console.log('[Stripe Webhook] Event received:', {
		id: event.id,
		type: event.type,
		objectId: event.data.object.id,
		amount: event.data.object.amount,
		status: event.data.object.status,
		metadata: event.data.object.metadata,
	})

	const store: IdempotencyStore = {
		get: (key) => c.env.STRIPE_IDEMPOTENCY.get(key),
		put: (key, value, options) =>
			c.env.STRIPE_IDEMPOTENCY.put(key, value, options),
	}

	if (event.type === 'charge.succeeded') {
		const chargeMetadata = extractChargeMetadata(event)
		if (!chargeMetadata) {
			console.error(
				'[Stripe Webhook] Missing required metadata in charge event',
			)
			return c.json({ error: 'Missing metadata' }, 400)
		}

		console.log('[Stripe Webhook] Extracted charge metadata:', chargeMetadata)

		if (chargeMetadata.environment !== env.ENVIRONMENT) {
			console.error('[Stripe Webhook] Environment mismatch:', {
				expected: env.ENVIRONMENT,
				received: chargeMetadata.environment,
			})
			return c.json({ error: 'Environment mismatch' }, 400)
		}

		const amountInDollars = getChargeAmountInDollars(event)
		if (amountInDollars === null) {
			console.error('[Stripe Webhook] Invalid charge amount or currency')
			return c.json({ error: 'Invalid charge amount or currency' }, 400)
		}

		if (!env.TESTNET_SENDER_PRIVATE_KEY) {
			console.error('[Stripe Webhook] Sender private key not set')
			return c.json({ error: 'Sender not configured' }, 500)
		}

		const DONOTUSEUSD_TOKEN_ADDRESS =
			'0x20C000000000000000000000033aBB6ac7D235e5'

		console.log('[Stripe Webhook] Processing charge:', {
			chargeId: event.data.object.id,
			destinationAddress: chargeMetadata.destinationAddress,
			amountInDollars,
			environment: env.ENVIRONMENT,
		})

		const result = await processWithIdempotency(
			store,
			event.data.object.id,
			() =>
				sendTestnetFunds({
					senderPrivateKey: env.TESTNET_SENDER_PRIVATE_KEY,
					tokenAddress: DONOTUSEUSD_TOKEN_ADDRESS,
					destinationAddress: chargeMetadata.destinationAddress as Address,
					amount: amountInDollars,
					environment: env.ENVIRONMENT as Environment,
					rpcAuth: env.PRESTO_RPC_AUTH,
				}),
		)

		console.log('[Stripe Webhook] Charge processing complete:', {
			chargeId: event.data.object.id,
			txHash: result?.txHash,
			success: !!result,
		})

		return c.json({ received: true, txHash: result?.txHash })
	}

	if (event.type !== 'payment_intent.succeeded') {
		console.log('[Stripe Webhook] Ignoring non-handled event:', event.type)
		return c.json({ received: true })
	}

	const metadata = extractPaymentMetadata(event)
	if (!metadata) {
		console.error('[Stripe Webhook] Missing required metadata in event')
		return c.json({ error: 'Missing metadata' }, 400)
	}

	console.log('[Stripe Webhook] Extracted metadata:', metadata)

	if (metadata.environment !== env.ENVIRONMENT) {
		console.error('[Stripe Webhook] Environment mismatch:', {
			expected: env.ENVIRONMENT,
			received: metadata.environment,
		})
		return c.json({ error: 'Environment mismatch' }, 400)
	}

	if (!env.TESTNET_SENDER_PRIVATE_KEY || !env.TESTNET_TOKEN_ADDRESS) {
		console.error('[Stripe Webhook] Testnet config not set')
		return c.json({ error: 'Testnet not configured' }, 500)
	}

	console.log('[Stripe Webhook] Processing payment:', {
		paymentIntentId: event.data.object.id,
		destinationAddress: metadata.destinationAddress,
		amount: metadata.amount,
		environment: env.ENVIRONMENT,
	})

	const result = await processWithIdempotency(store, event.data.object.id, () =>
		sendTestnetFunds({
			senderPrivateKey: env.TESTNET_SENDER_PRIVATE_KEY,
			tokenAddress: env.TESTNET_TOKEN_ADDRESS,
			destinationAddress: metadata.destinationAddress as Address,
			amount: Number.parseFloat(metadata.amount),
			environment: env.ENVIRONMENT as Environment,
			rpcAuth: env.PRESTO_RPC_AUTH,
		}),
	)

	console.log('[Stripe Webhook] Processing complete:', {
		paymentIntentId: event.data.object.id,
		txHash: result?.txHash,
		success: !!result,
	})

	return c.json({ received: true, txHash: result?.txHash })
})

export default app
