import { createServerFn } from '@tanstack/react-start'
import type { PaymentsSnapshot } from '#lib/payments'
import { getPaymentsSnapshot } from '#lib/server/payments-data'
import { getTempoChain } from '#wagmi.config'

export const fetchPayments = createServerFn({ method: 'GET' }).handler(
	async (): Promise<PaymentsSnapshot> => {
		try {
			return await getPaymentsSnapshot(getTempoChain().id)
		} catch (error) {
			console.error('Failed to load payments:', error)
			throw new Error(
				'Payment volume is unavailable right now. Try again in a few minutes.',
			)
		}
	},
)
