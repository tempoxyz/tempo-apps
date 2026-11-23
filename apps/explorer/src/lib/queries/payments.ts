import { queryOptions } from '@tanstack/react-query'
import { fetchPayments } from '#lib/server/payments'
import { getTempoChain } from '#wagmi.config'

export function paymentsQueryOptions() {
	return queryOptions({
		queryKey: ['payments', getTempoChain().id],
		queryFn: () => fetchPayments(),
		// The server answers from its edge cache, so polling is cheap; it matches
		// how often today's volume refreshes there.
		staleTime: 60_000,
		refetchInterval: 120_000,
		retry: 1,
	})
}
