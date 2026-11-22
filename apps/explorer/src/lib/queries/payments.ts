import { queryOptions } from '@tanstack/react-query'
import { fetchPayments } from '#lib/server/payments'
import { getTempoChain } from '#wagmi.config'

export function paymentsQueryOptions() {
	return queryOptions({
		queryKey: ['payments', getTempoChain().id],
		queryFn: () => fetchPayments(),
		staleTime: 60_000,
		refetchInterval: 300_000,
		retry: 1,
	})
}
