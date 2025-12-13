import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import type { BalanceChangesData } from '#routes/api/tx/balance-changes/$hash'

export type {
	BalanceChangesData,
	TokenBalanceChange,
	TokenMetadata,
} from '#routes/api/tx/balance-changes/$hash'

export const LIMIT = 20

export function balanceChangesQueryOptions(params: {
	hash: string
	page: number
}) {
	const offset = (params.page - 1) * LIMIT
	return queryOptions({
		queryKey: ['balance-changes', params.hash, params.page],
		queryFn: async (): Promise<BalanceChangesData> => {
			const url = `${__BASE_URL__}/api/tx/balance-changes/${params.hash}?limit=${LIMIT}&offset=${offset}`
			const response = await fetch(url)
			const data: BalanceChangesData & { error?: string } =
				await response.json()
			if (data.error) throw new Error(data.error)
			return data
		},
		staleTime: Infinity, // data is immutable
		placeholderData: keepPreviousData,
	})
}
