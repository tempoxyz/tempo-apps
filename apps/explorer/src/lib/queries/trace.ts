import { queryOptions } from '@tanstack/react-query'
import type { TraceData } from '#routes/api/tx/trace/$hash'

export type { CallTrace, TraceData } from '#routes/api/tx/trace/$hash'

export function traceQueryOptions(params: { hash: string }) {
	return queryOptions({
		queryKey: ['trace', params.hash],
		queryFn: async (): Promise<TraceData> => {
			const url = `${__BASE_URL__}/api/tx/trace/${params.hash}`
			const response = await fetch(url)
			const data: TraceData & { error?: string } = await response.json()
			if (data.error) throw new Error(data.error)
			return data
		},
		staleTime: Infinity,
	})
}
