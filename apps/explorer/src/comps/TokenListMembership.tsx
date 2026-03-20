import { useQuery } from '@tanstack/react-query'
import type { Address } from 'ox'
import * as React from 'react'
import { useChainId } from 'wagmi'
import { TOKENLIST_URLS } from '#lib/tokenlist'

type TokenListAsset = {
	address?: string
}

type TokenListResponse = {
	tokens?: TokenListAsset[]
}

type TokenListMembershipContextValue = {
	areTokensListed: (
		addresses: ReadonlyArray<Address.Address | string | null | undefined>,
	) => boolean
	isTokenListed: (
		address: Address.Address | string | null | undefined,
	) => boolean
}

const TokenListMembershipContext =
	React.createContext<TokenListMembershipContextValue>({
		areTokensListed: () => true,
		isTokenListed: () => true,
	})

async function fetchTokenListAddresses(chainId: number): Promise<Set<string>> {
	const url = TOKENLIST_URLS[chainId]
	if (!url) return new Set()

	const response = await fetch(url)
	if (!response.ok) throw new Error('Failed to fetch token list')

	const data = (await response.json()) as TokenListResponse
	const addresses = new Set<string>()
	for (const token of data.tokens ?? []) {
		if (typeof token.address === 'string')
			addresses.add(token.address.toLowerCase())
	}
	return addresses
}

export function TokenListMembershipProvider(props: {
	children: React.ReactNode
}) {
	const chainId = useChainId()
	const { data, isLoading } = useQuery({
		queryKey: ['tokenlist-membership', chainId],
		queryFn: () => fetchTokenListAddresses(chainId),
		staleTime: 1000 * 60 * 10,
		gcTime: 1000 * 60 * 60,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
		retry: 1,
	})

	const value = React.useMemo<TokenListMembershipContextValue>(() => {
		const isTokenListed: TokenListMembershipContextValue['isTokenListed'] = (
			address,
		) => {
			if (!address) return true
			if (isLoading) return false
			if (!data || data.size === 0) return true
			return data.has(address.toLowerCase())
		}

		const areTokensListed: TokenListMembershipContextValue['areTokensListed'] =
			(addresses) => {
				if (isLoading) return false
				if (!data || data.size === 0) return true

				for (const address of addresses) {
					if (!address) continue
					if (!data.has(address.toLowerCase())) return false
				}

				return true
			}

		return {
			areTokensListed,
			isTokenListed,
		}
	}, [data, isLoading])

	return (
		<TokenListMembershipContext.Provider value={value}>
			{props.children}
		</TokenListMembershipContext.Provider>
	)
}

export function useTokenListMembership() {
	return React.useContext(TokenListMembershipContext)
}
