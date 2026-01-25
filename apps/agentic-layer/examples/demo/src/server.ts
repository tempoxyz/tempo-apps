import express from 'express'
import cors from 'cors'
import {
	createPaymentGate,
	type PaymentRequest,
} from '../../../packages/server/src'
import { ConsoleLogger } from '../../../packages/common/src'
import { config } from './config'

/**
 * Tempo 402 Demo Server
 * Demonstrates how to protect API routes with the Tempo Agentic Layer.
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

// Initialize Payment Gate with Logging
const logger = new ConsoleLogger('debug')
const gate = createPaymentGate({
	logger,
	recipient: config.recipient,
	amount: config.amount,
	rpcUrl: config.rpcUrl,
})

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', server: 'express' }))

// Protected Premium Route
app.get(
	'/premium-data',
	gate as express.RequestHandler,
	(req: PaymentRequest, res: express.Response) => {
		const txHash = req.payment?.txHash
		logger.info(`Serving premium data`, { txHash })

		res.json({
			success: true,
			data: 'Protected institutional asset successfully settled via 402 protocol.',
			txHash,
			timestamp: new Date().toISOString(),
		})
	},
)

app.listen(config.port, () => {
	logger.info(`Server running on http://localhost:${config.port}`)
	console.log(`\nTry the agent: npm run start:agent`)
})
