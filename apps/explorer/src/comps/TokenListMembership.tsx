import { useQuery } from '@tanstack/react-query'
import type { Address } from 'ox'
import * as React from 'react'
import { TOKENLIST_BASE_URL } from '#lib/tokenlist'

const TOKENLIST_ALL_URL = `${TOKENLIST_BASE_URL}/lists/all`

type TokenListAsset = {
	address?: string
	chainId?: number
}

type TokenListResponse = Array<{
	tokens?: TokenListAsset[]
}>

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
	const response = await fetch(TOKENLIST_ALL_URL)
	if (!response.ok) throw new Error('Failed to fetch token lists')

	const lists = (await response.json()) as TokenListResponse
	const membershipMap = new Map<number, Set<string>>()

	for (const list of lists) {
		for (const token of list.tokens ?? []) {
			if (typeof token.chainId !== 'number') continue
			if (typeof token.address !== 'string') continue

			const normalizedAddress = token.address.toLowerCase()
			let set = membershipMap.get(token.chainId)
			if (!set) {
				set = new Set<string>()
				membershipMap.set(token.chainId, set)
			}
			set.add(normalizedAddress)
		}
	}

	return membershipMap
}

export function TokenListMembershipProvider(props: {
	children: React.ReactNode
}) {
	const { data, isLoading } = useQuery({
		queryKey: ['tokenlist-membership'],
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
