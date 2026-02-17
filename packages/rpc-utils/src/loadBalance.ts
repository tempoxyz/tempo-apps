import { type Transport, type TransportConfig, createTransport } from 'viem'

// Adapted from https://github.com/ponder-sh/ponder/blob/main/packages/utils/src/loadBalance.ts

/**
 * Creates a load balanced transport that spreads requests between child
 * transports using a round-robin algorithm.
 */
export const loadBalance = (transports: Transport[]): Transport => {
	return ({ chain, retryCount, timeout }) => {
		const resolvedTransports = transports.map((transport) =>
			chain === undefined
				? transport({ retryCount: 0, timeout })
				: transport({ chain, retryCount: 0, timeout }),
		)

		let index = 0

		return createTransport({
			key: 'loadBalance',
			name: 'Load Balance',
			request: (body) => {
				const response = resolvedTransports[index]?.request(body)
				index = index === resolvedTransports.length - 1 ? 0 : index + 1
				return response
			},
			retryCount,
			timeout,
			type: 'loadBalance',
		} as TransportConfig)
	}
}
