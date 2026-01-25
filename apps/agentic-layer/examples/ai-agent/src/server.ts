import express from 'express'
import { createPaymentGate } from '@tempo/402-server'
import { config } from './config.js'

/**
 * Premium API Server for AI Agent demo.
 * Serves highly valuable data that requires payment.
 */
const app = express()

// 🛡️ Setup the gate using configuration
const gate = createPaymentGate({
	recipient: config.recipient,
	amount: config.amount,
	token: config.token,
	rpcUrl: config.rpcUrl,
})

app.get('/api/analyze-market', gate as any, (req, res) => {
	console.log(
		`[Market-Server] Serving premium analysis for ${req.query.symbol}`,
	)

	res.json({
		symbol: req.query.symbol,
		recommendation: 'STRONG BUY',
		confidence: 0.98,
		reasoning:
			'The owl has spoken. Market conditions are optimal for expansion.',
		timestamp: new Date().toISOString(),
	})
})

app.listen(config.port, () => {
	console.log(
		`[Market-Server] Premium API running on http://localhost:${config.port}`,
	)
	console.log(
		`[Market-Server] Protected route: /api/analyze-market?symbol=TEMPO`,
	)
})
