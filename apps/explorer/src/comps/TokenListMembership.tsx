import { useQuery } from '@tanstack/react-query'
import type { Address } from 'ox'
import * as React from 'react'
import type { VerifiedTokensApiResponse } from '#routes/api/verified-tokens'

type TokenListMembershipMap = Map<number, Set<string>>

type TokenListMembershipContextValue = {
	areTokensListed: (
		chainId: number,
		addresses: ReadonlyArray<Address.Address | undefined>,
	) => boolean
	isTokenListed: (
		chainId: number,
		address: Address.Address | undefined,
	) => boolean
}

const TokenListMembershipContext =
	React.createContext<TokenListMembershipContextValue>({
		areTokensListed: () => false,
		isTokenListed: () => false,
	})

async function fetchTokenListMembershipMap(): Promise<TokenListMembershipMap> {
	const response = await fetch('/api/verified-tokens')
	if (!response.ok) throw new Error('Failed to fetch verified tokens')

	const { chainId, addresses } =
		(await response.json()) as VerifiedTokensApiResponse

	return new Map([[chainId, new Set(addresses)]])
}

export function TokenListMembershipProvider(props: {
	children: React.ReactNode
}) {
	const { data, isLoading } = useQuery({
		queryKey: ['verified-token-membership'],
		queryFn: fetchTokenListMembershipMap,
		staleTime: 1000 * 60 * 10,
		gcTime: 1000 * 60 * 60,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
		retry: 1,
	})

	const value = React.useMemo<TokenListMembershipContextValue>(() => {
		const isTokenListed: TokenListMembershipContextValue['isTokenListed'] = (
			chainId,
			address,
		) => {
			if (!address) return true
			if (isLoading) return false
			const listed = data?.get(chainId)
			if (!listed || listed.size === 0) return false
			return listed.has(address.toLowerCase())
		}

		const areTokensListed: TokenListMembershipContextValue['areTokensListed'] =
			(chainId, addresses) => {
				if (isLoading) return false
				const listed = data?.get(chainId)
				if (!listed || listed.size === 0) return false

				for (const address of addresses) {
					if (!address) continue
					if (!listed.has(address.toLowerCase())) return false
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
