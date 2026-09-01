import { useQuery } from '@tanstack/react-query'
import type { Address } from 'ox'
import * as React from 'react'
import { formatUnits } from 'viem'

import { getApiUrl } from '#lib/env.ts'

export type TokenBalance = {
	token: Address.Address
	balance: string
	name?: string
	symbol?: string
	decimals?: number
	currency?: string
	valuation?: {
		amount: string
		currency: string
		decimals: number
	}
}

export type BalancesResponse = {
	balances: TokenBalance[]
	error?: string
}

export type AssetData = {
	address: Address.Address
	metadata:
		| { name?: string; symbol?: string; decimals?: number; currency?: string }
		| undefined
	balance: bigint | undefined
	valuation: { amount: bigint; currency: string; decimals: number } | undefined
}

async function fetchAddressBalances(
	address: Address.Address,
): Promise<BalancesResponse> {
	const response = await fetch(getApiUrl(`/api/address/balances/${address}`), {
		headers: { 'Content-Type': 'application/json' },
	})
	return response.json() as Promise<BalancesResponse>
}

export function balancesQueryOptions(address: Address.Address) {
	return {
		queryKey: ['address-balances', address],
		queryFn: () => fetchAddressBalances(address),
		staleTime: 60_000,
	}
}

export function useBalancesData(
	accountAddress: Address.Address,
	initialData?: BalancesResponse,
	enabled = true,
): {
	data: AssetData[]
	isLoading: boolean
} {
	const { data, isLoading } = useQuery({
		...balancesQueryOptions(accountAddress),
		initialData,
		enabled,
	})

	const assetsData = React.useMemo(() => {
		if (!data?.balances) return []
		return data.balances.map((token) => ({
			address: token.token,
			metadata: {
				name: token.name,
				symbol: token.symbol,
				decimals: token.decimals,
				currency: token.currency,
			},
			balance: BigInt(token.balance),
			valuation: token.valuation
				? {
						amount: BigInt(token.valuation.amount),
						currency: token.valuation.currency,
						decimals: token.valuation.decimals,
					}
				: undefined,
		}))
	}, [data])

	return { data: assetsData, isLoading }
}

export function calculateTotalHoldings(
	assetsData: ReadonlyArray<AssetData>,
	options?: {
		isTokenListed?: ((address: Address.Address) => boolean) | undefined
	},
): number | undefined {
	let total: number | undefined
	for (const asset of assetsData) {
		if (options?.isTokenListed && !options.isTokenListed(asset.address)) {
			continue
		}
		const value = getAssetValue(asset)
		if (!value || value.currency !== 'USD') continue
		total = (total ?? 0) + Number(formatUnits(value.amount, value.decimals))
	}
	return total
}

/** Returns a token's explicit valuation, falling back to its face value. */
export function getAssetValue(
	asset: AssetData,
): { amount: bigint; currency: string; decimals: number } | undefined {
	if (asset.valuation) return asset.valuation
	if (
		asset.balance === undefined ||
		asset.metadata?.currency === undefined ||
		asset.metadata.decimals === undefined
	)
		return undefined
	return {
		amount: asset.balance,
		currency: asset.metadata.currency,
		decimals: asset.metadata.decimals,
	}
}
