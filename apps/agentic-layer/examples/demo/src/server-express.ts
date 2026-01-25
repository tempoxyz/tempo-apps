import express from 'express'
import cors from 'cors'
import {
	createPaymentGate,
	type PaymentRequest,
} from '../../../packages/server/src'
import { config } from './config'

/**
 * Express Demo Server: Production-ready implementation with Express.
 */
const app = express()

app.use(
	cors({
		origin: true,
		credentials: true,
		allowedHeaders: ['Content-Type', 'Authorization'],
		exposedHeaders: ['WWW-Authenticate'],
		methods: ['GET', 'POST', 'OPTIONS'],
	}),
)

// Provide 402 Gate Configuration
const gate = createPaymentGate({
	recipient: config.recipient,
	amount: config.amount,
	token: config.token,
	rpcUrl: config.rpcUrl,
})

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', server: 'express' }))

// Protected Route
app.get(
	'/premium-data',
	gate as express.RequestHandler,
	(req: PaymentRequest, res: express.Response) => {
		const txHash = req.payment?.txHash
		console.log(`[Express-Server] Serving premium data for ${txHash}`)

		res.json({
			success: true,
			data: 'This secret is protected by Express. The owl hunts at midnight.',
			server: 'express',
			paymentRef: txHash,
			timestamp: new Date().toISOString(),
		})
	},
)

app.listen(config.port, () => {
	console.log(`[Express-Server] Running on http://localhost:${config.port}`)
})
