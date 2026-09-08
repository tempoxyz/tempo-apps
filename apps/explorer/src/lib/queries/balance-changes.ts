import { queryOptions } from '@tanstack/react-query'
import type { Hex } from 'ox'
import type { BalanceChangesData } from '#routes/api/tx/balance-changes/$hash'

export type {
	BalanceChangesData,
	TokenBalanceChange,
	TokenMetadata,
} from '#routes/api/tx/balance-changes/$hash'

export const LIMIT = 20

export function balanceChangesQueryOptions(params: {
	hash: Hex.Hex
	limit: number
	offset: number
}) {
	return queryOptions({
		queryKey: ['balance-changes', params.hash, params.limit, params.offset],
		queryFn: async (): Promise<BalanceChangesData> => {
			const search = new URLSearchParams({
				limit: String(params.limit),
				offset: String(params.offset),
			})
			const response = await fetch(
				`/api/tx/balance-changes/${params.hash}?${search.toString()}`,
			)
			if (!response.ok)
				throw new Error(`Failed to fetch balance changes: ${response.status}`)
			return response.json()
		},
		staleTime: Infinity,
	})
}
