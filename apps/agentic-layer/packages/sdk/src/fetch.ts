import type { SettlementHandler } from './settlement'
import type { PaymentRequirement } from './types'

/**
 * A wrapper for native fetch that automatically handles 402 Payment Required challenges.
 *
 * @param settlement - An instance of SettlementHandler
 * @returns A fetch-compatible function
 */
export function createFetch(settlement: SettlementHandler) {
	return async (
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> => {
		const response = await fetch(input, init)

		if (response.status === 402) {
			// Re-read body to get paymentInfo
			const data = await response.clone().json()
			const paymentInfo = (data as { paymentInfo?: PaymentRequirement })
				?.paymentInfo

			if (paymentInfo) {
				const txHash = await settlement.settle(paymentInfo)

				// Retry with authorization header
				const newInit = {
					...init,
					headers: {
						...init?.headers,
						Authorization: `Tempo ${txHash}`,
					},
				}

				return fetch(input, newInit)
			}
		}

		return response
	}
}
