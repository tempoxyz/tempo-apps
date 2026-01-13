import { env } from 'cloudflare:workers'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoChain } from './lib/chain'
import { rateLimitMiddleware } from './lib/rate-limit'
import verifyRoute from './routes/verify'
import settleRoute from './routes/settle'
import requirementsRoute from './routes/requirements'

const app = new Hono()

// CORS middleware
app.use(
	'*',
	cors({
		origin: (origin) => {
			// @ts-expect-error - Env types will be resolved with worker deployment
			const allowedOrigins = env.ALLOWED_ORIGINS as string
			if (allowedOrigins === '*') return '*'
			if (origin && allowedOrigins.includes(origin)) return origin
			return null
		},
		allowMethods: ['GET', 'POST', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization'],
		maxAge: 86400,
	}),
)

// Initialize dependencies middleware
app.use('*', async (c, next) => {
	// @ts-expect-error - Env types will be resolved with worker deployment
	const feePayerAccount = privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`)
	// @ts-expect-error - Env types will be resolved with worker deployment
	const rpcUrl = env.TEMPO_RPC_URL ?? tempoChain.rpcUrls.default.http[0]

	const viemClient = createPublicClient({
		chain: tempoChain as any,
		transport: http(rpcUrl),
	})

	c.set('feePayerAccount', feePayerAccount)
	c.set('feePayerAddress', feePayerAccount.address)
	// @ts-expect-error - Chain type mismatch with viem versions
	c.set('viemClient', viemClient)
	c.set('tempoChain', tempoChain)
	c.set('rpcUrl', rpcUrl)

	await next()
})

// Rate limiting
app.use('*', rateLimitMiddleware)

// Routes
app.route('/verify', verifyRoute)
app.route('/settle', settleRoute)
app.route('/payment-requirements', requirementsRoute)

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

export default app
