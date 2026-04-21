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
	const PRICE_PER_TOKEN = 1
	let total: number | undefined
	for (const asset of assetsData) {
		if (asset.metadata?.currency !== 'USD') continue
		if (options?.isTokenListed && !options.isTokenListed(asset.address)) {
			continue
		}
		const decimals = asset.metadata?.decimals
		const balance = asset.balance
		if (decimals === undefined || balance === undefined) continue
		total =
			(total ?? 0) + Number(formatUnits(balance, decimals)) * PRICE_PER_TOKEN
	}
	return total
}
