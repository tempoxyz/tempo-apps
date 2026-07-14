import { createServerFn } from '@tanstack/react-start'
import { type InferResponseType, parseResponse } from 'hono/client'
import type { Address } from 'ox'
import { Addresses } from 'viem/tempo'
import { getChainId } from 'wagmi/actions'
import { api } from '#lib/server/tempo-api'
import { parseTimestamp } from '#lib/timestamp'
import { getWagmiConfig } from '#wagmi.config'

export type FeeAmmPool = {
	poolId: `0x${string}`
	userToken: Address.Address
	validatorToken: Address.Address
	createdAt: number | null
	latestMintAt: number | null
	mintCount: number
	reserveUserToken: bigint
	reserveValidatorToken: bigint
	liquidityUsd: number
	userTokenSymbol?: string | undefined
	userTokenName?: string | undefined
	userTokenDecimals?: number | undefined
	validatorTokenSymbol?: string | undefined
	validatorTokenName?: string | undefined
	validatorTokenDecimals?: number | undefined
}

type PoolsResponse = InferResponseType<
	(typeof api.v1)['fee-amm']['pools']['$get'],
	200
>

/** Max number of pools the page shows (API bounds to the same limit). */
const POOL_LIMIT = 50

/**
 * Maps API pools (token metadata + live reserves included) into the page's
 * shape, sorted pathUSD-validator pools first, then by liquidity, then by
 * most recent activity.
 */
export function mapFeeAmmPools(pools: PoolsResponse['data']): FeeAmmPool[] {
	return pools
		.map((pool) => ({
			poolId: pool.poolId,
			userToken: pool.userToken.address,
			validatorToken: pool.validatorToken.address,
			createdAt: parseTimestamp(pool.createdAt) ?? null,
			latestMintAt: parseTimestamp(pool.lastMintAt) ?? null,
			mintCount: pool.mintCount,
			reserveUserToken: BigInt(pool.userToken.amount ?? 0),
			reserveValidatorToken: BigInt(pool.validatorToken.amount ?? 0),
			liquidityUsd:
				Number(pool.userToken.formatted ?? 0) +
				Number(pool.validatorToken.formatted ?? 0),
			userTokenName: pool.userToken.name,
			userTokenSymbol: pool.userToken.symbol,
			userTokenDecimals: pool.userToken.decimals,
			validatorTokenName: pool.validatorToken.name,
			validatorTokenSymbol: pool.validatorToken.symbol,
			validatorTokenDecimals: pool.validatorToken.decimals,
		}))
		.sort((a, b) => {
			const pathUsd = Addresses.pathUsd.toLowerCase()
			const aPriority = a.validatorToken.toLowerCase() === pathUsd
			const bPriority = b.validatorToken.toLowerCase() === pathUsd

			if (aPriority !== bPriority) {
				return aPriority ? -1 : 1
			}

			if (a.liquidityUsd !== b.liquidityUsd) {
				return b.liquidityUsd - a.liquidityUsd
			}

			const aTimestamp = a.latestMintAt ?? a.createdAt ?? 0
			const bTimestamp = b.latestMintAt ?? b.createdAt ?? 0
			return bTimestamp - aTimestamp
		})
		.slice(0, POOL_LIMIT)
}

export const fetchFeeAmmPools = createServerFn({ method: 'POST' }).handler(
	async (): Promise<FeeAmmPool[]> => {
		try {
			const chainId = getChainId(getWagmiConfig())
			const { data } = await parseResponse(
				api.v1['fee-amm'].pools.$get({ query: { chainId: String(chainId) } }),
			)
			return mapFeeAmmPools(data)
		} catch (error) {
			console.error('Failed to fetch Fee AMM pools:', error)
			return []
		}
	},
)
