import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import * as z from 'zod/mini'
import { getApiUrl } from '#lib/env.ts'

const FeeAmmPoolsResponseSchema = z.object({
	pools: z.array(
		z.object({
			userToken: z.string(),
			validatorToken: z.string(),
			reserveUserToken: z.string(),
			reserveValidatorToken: z.string(),
		}),
	),
})

export type FeeAmmPool = {
	userToken: Address.Address
	validatorToken: Address.Address
	reserveUserToken: bigint
	reserveValidatorToken: bigint
}

export function feeAmmPoolsQueryOptions() {
	return queryOptions({
		queryKey: ['fee-amm-pools'],
		queryFn: async ({ signal }): Promise<FeeAmmPool[]> => {
			const response = await fetch(getApiUrl('/api/fee-amm/pools'), { signal })

			if (!response.ok) {
				throw new Error('Failed to fetch Fee AMM pools')
			}

			const parsed = z.safeParse(
				FeeAmmPoolsResponseSchema,
				await response.json(),
			)
			if (!parsed.success) {
				throw new Error(z.prettifyError(parsed.error))
			}

			return parsed.data.pools
				.map((pool) => ({
					userToken: pool.userToken as Address.Address,
					validatorToken: pool.validatorToken as Address.Address,
					reserveUserToken: BigInt(pool.reserveUserToken),
					reserveValidatorToken: BigInt(pool.reserveValidatorToken),
				}))
				.sort((a, b) => {
					const aKey = `${a.userToken}:${a.validatorToken}`
					const bKey = `${b.userToken}:${b.validatorToken}`
					return aKey.localeCompare(bKey)
				})
		},
		staleTime: 60_000,
	})
}
