import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { fourZeroTwo } from '@tempo/402-server'
import 'dotenv/config'

const app = new Hono()

// 🛡️ Premium API Gateway (Standard configuration)
const gate = fourZeroTwo({
	recipient:
		process.env.TEMPO_RECIPIENT || '0x1234567890123456789012345678901234567890',
	amount: '100000', // 0.10 USD
	rpcUrl: process.env.TEMPO_RPC_URL || 'https://rpc.moderato.tempo.xyz',
})

app.get('/api/v1/intelligence', gate, (c) => {
	console.log(`[Hono-Intel] Serving intelligence report`)
	return c.json({
		report: 'The market signals are crystal clear.',
		alpha: 'Stablecoin adoption in agentic workflows is up 402%.',
		timestamp: new Date().toISOString(),
	})
})

app.get(
	'/api/v1/cheap',
	fourZeroTwo({
		recipient:
			process.env.TEMPO_RECIPIENT ||
			'0x1234567890123456789012345678901234567890',
		amount: '100',
		rpcUrl: process.env.TEMPO_RPC_URL || 'https://rpc.moderato.tempo.xyz',
	}),
	(c) => {
		return c.json({ data: 'This only cost 0.0001 pathUSD' })
	},
)

const port = Number(process.env.PORT) || 3002
console.log(`[Hono-Intel] Premium API running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
