import { handle402Request, prepareGateConfig, type GateConfig } from './generic'

/**
 * Configuration for the Hono 402 authorization gate.
 */
export interface HonoGateConfig extends GateConfig {}

/**
 * Standardized Hono middleware for 402-server authorization.
 *
 * Intercepts requests, validates 'Authorization: Tempo <txHash>' header,
 * and returns 402 Payment Required if no valid payment is found.
 *
 * @param config - Middleware configuration
 * @returns Hono MiddlewareHandler
 */
export const fourZeroTwo = (config: HonoGateConfig): MiddlewareHandler => {
	const preparedConfig = prepareGateConfig(config)

	return async (c: Context, next: Next) => {
		const auth = c.req.header('Authorization')
		const result = await handle402Request(auth, preparedConfig)

		if (result.authorized) {
			return await next()
		}

		// Set headers if provided
		if (result.headers) {
			for (const [key, value] of Object.entries(result.headers)) {
				c.header(key, value)
			}
		}

		return c.json(result.body, result.status as any)
	}
}
