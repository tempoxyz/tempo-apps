import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { fourZeroTwo } from '../../../packages/server/src'
import { config } from './config'

/**
 * Hono Demo Server: Minimalist implementation using the Hono middleware.
 */
const app = new Hono()

app.use(
	'*',
	cors({
		origin: '*', // Allow all for demo
		allowHeaders: ['Content-Type', 'Authorization', 'WWW-Authenticate'],
		exposeHeaders: ['WWW-Authenticate'],
	}),
)

// Provide 402 Gate Configuration
const gate = fourZeroTwo({
	recipient: config.recipient,
	amount: config.amount,
	token: config.token,
	rpcUrl: config.rpcUrl,
})

// Health check
app.get('/health', (c) => c.json({ status: 'ok', server: 'hono' }))

// Protected Route
app.get('/premium-data', gate, (c) => {
	console.log(
		`[Hono-Server] Serving premium data for ${c.req.header('Authorization')?.split(' ')[1]}`,
	)
	return c.json({
		success: true,
		data: 'This secret is served by Hono. The falcon soars at dusk.',
		server: 'hono',
		timestamp: new Date().toISOString(),
	})
})

console.log(`[Hono-Server] Running on http://localhost:${config.port}`)
serve({ fetch: app.fetch, port: config.port })
