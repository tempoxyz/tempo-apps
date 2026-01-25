import type { Request, Response, NextFunction } from 'express'
import { handle402Request, prepareGateConfig, type GateConfig } from './generic'

/**
 * Extended Express Request with payment context
 */
export interface PaymentRequest extends Request {
	payment?: {
		txHash: `0x${string}`
	}
}

/**
 * Configuration for the Express 402 authorization gate.
 */
export interface ExpressGateConfig extends GateConfig {}

/**
 * Standardized Express middleware for 402-server authorization.
 * Maintains backward compatibility with existing Express applications.
 *
 * @param config - Middleware configuration
 * @returns Express RequestHandler
 */
export const createPaymentGate = (config: ExpressGateConfig) => {
	const preparedConfig = prepareGateConfig(config)

	return async (req: PaymentRequest, res: Response, next: NextFunction) => {
		const auth = req.headers.authorization
		const result = await handle402Request(auth, preparedConfig)

		if (result.authorized) {
			req.payment = { txHash: result.txHash! }
			return next()
		}

		// Set headers if provided
		if (result.headers) {
			for (const [key, value] of Object.entries(result.headers)) {
				res.setHeader(key, value)
			}
		}

		return res.status(result.status).json(result.body)
	}
}
