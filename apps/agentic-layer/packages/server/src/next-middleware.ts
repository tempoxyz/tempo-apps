import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { handle402Request, prepareGateConfig, type GateConfig } from './generic'

/**
 * Configuration for the Next.js 402 gate.
 */
export interface NextGateConfig extends GateConfig {}

/**
 * Wrapper for Next.js Route Handlers to enforce 402 Payment Required.
 *
 * @param config - Gate configuration
 * @param handler - The actual route handler
 */
export function with402(
	config: NextGateConfig,
	handler: (req: NextRequest, context?: any) => Promise<Response>,
) {
	const preparedConfig = prepareGateConfig(config)

	return async (req: NextRequest, context?: any) => {
		const auth = req.headers.get('Authorization')
		const result = await handle402Request(auth, preparedConfig)

		if (result.authorized) {
			return handler(req, context)
		}

		return NextResponse.json(result.body, {
			status: result.status,
			headers: result.headers,
		})
	}
}
