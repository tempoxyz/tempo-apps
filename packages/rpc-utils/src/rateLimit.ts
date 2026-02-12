import { type Transport, type TransportConfig, createTransport } from 'viem'
import { createQueue } from './utils/queue'

// Adapted from https://github.com/ponder-sh/ponder/blob/main/packages/utils/src/rateLimit.ts

/**
 * Creates a rate limited transport that throttles request throughput.
 */
export const rateLimit = (
	transport: Transport,
	{
		requestsPerSecond,
		browser = true,
	}: { requestsPerSecond: number; browser?: boolean },
): Transport => {
	return ({ chain, retryCount, timeout }) => {
		const resolvedTransport =
			chain === undefined
				? transport({ retryCount: 0, timeout })
				: transport({ chain, retryCount: 0, timeout })

		const queue = createQueue({
			frequency: requestsPerSecond,
			concurrency: Math.ceil(requestsPerSecond / 4),
			initialStart: true,
			browser,
			worker: (body: { method: string; params?: unknown }) => {
				return resolvedTransport.request(body)
			},
		})

		return createTransport({
			key: 'rateLimit',
			name: 'Rate Limit',
			request: (body) => queue.add(body),
			retryCount,
			type: 'rateLimit',
		} as TransportConfig)
	}
}
