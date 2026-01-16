import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import { getChainId } from 'wagmi/actions'
import tokensIndex31318 from '#data/tokens-index-31318.json' with {
	type: 'json',
}
import tokensIndex42429 from '#data/tokens-index-42429.json' with {
	type: 'json',
}
import tokensIndex42431 from '#data/tokens-index-42431.json' with {
	type: 'json',
}
import tokensIndex4217 from '#data/tokens-index-4217.json' with { type: 'json' }
import { isTip20Address } from '#lib/domain/tip20'
import { getWagmiConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

export type SearchResult =
	| {
			type: 'token'
			address: Address.Address
			symbol: string
			name: string
			isTip20: boolean
	  }
	| {
			type: 'address'
			address: Address.Address
			isTip20: boolean
	  }
	| {
			type: 'transaction'
			hash: Hex.Hex
			timestamp?: number
	  }

export type SearchApiResponse = {
	results: SearchResult[]
	query: string
}

export type TokenSearchResult = Extract<SearchResult, { type: 'token' }>
export type AddressSearchResult = Extract<SearchResult, { type: 'address' }>
export type TransactionSearchResult = Extract<
	SearchResult,
	{ type: 'transaction' }
>

type Token = [address: Address.Address, symbol: string, name: string]

type IndexedToken = {
	address: Address.Address
	symbol: string
	name: string
	searchKey: string
}

function indexTokens(tokens: Token[]): IndexedToken[] {
	return tokens.map(([address, symbol, name]) => ({
		address,
		symbol,
		name,
		searchKey: `${symbol.toLowerCase()}|${name.toLowerCase()}|${address}`,
	}))
}

const INDEXED_TOKENS: Record<number, IndexedToken[]> = {
	31318: indexTokens(tokensIndex31318 as Token[]),
	42429: indexTokens(tokensIndex42429 as Token[]),
	42431: indexTokens(tokensIndex42431 as Token[]),
	4217: indexTokens(tokensIndex4217 as Token[]),
}

function searchTokens(query: string, chainId: number): TokenSearchResult[] {
	query = query.toLowerCase()
	const indexedTokens = INDEXED_TOKENS[chainId] ?? []

	// filter using search keys
	const matches = indexedTokens.filter((token) => {
		return query.startsWith('0x')
			? token.address.startsWith(query)
			: token.searchKey.includes(query)
	})

	matches.sort((a, b) => {
		const aSymbol = a.symbol.toLowerCase()
		const bSymbol = b.symbol.toLowerCase()
		const aName = a.name.toLowerCase()
		const bName = b.name.toLowerCase()

		// exact symbol
		if (aSymbol === query && bSymbol !== query) return -1
		if (bSymbol === query && aSymbol !== query) return 1

		// symbol prefix
		if (aSymbol.startsWith(query) && !bSymbol.startsWith(query)) return -1
		if (bSymbol.startsWith(query) && !aSymbol.startsWith(query)) return 1

		// exact name
		if (aName === query && bName !== query) return -1
		if (bName === query && aName !== query) return 1

		// name prefix
		if (aName.startsWith(query) && !bName.startsWith(query)) return -1
		if (bName.startsWith(query) && !aName.startsWith(query)) return 1

		return 0
	})

	return matches.slice(0, 5).map((token) => ({
		type: 'token' as const,
		address: token.address,
		symbol: token.symbol,
		name: token.name,
		isTip20: true, // all tokens in the index are tip20
	}))
}

export const Route = createFileRoute('/api/search')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url)
				const query = url.searchParams.get('q')?.trim() ?? ''

				if (!query)
					return Response.json({
						results: [],
						query,
					} satisfies SearchApiResponse)

				const chainId = getChainId(getWagmiConfig())
				const results: SearchResult[] = []

				// address
				if (Address.validate(query))
					results.push({
						type: 'address',
						address: query,
						isTip20: isTip20Address(query),
					})

				const isHash = Hex.validate(query) && Hex.size(query) === 32

				// hash
				if (isHash) {
					try {
						const result = await QB.selectFrom('txs')
							.select(['block_timestamp'])
							.where('chain', '=', chainId)
							.where('hash', '=', query)
							.limit(1)
							.executeTakeFirst()

						results.push({
							type: 'transaction',
							hash: query,
							timestamp: result?.block_timestamp
								? Number(result.block_timestamp)
								: undefined,
						})
					} catch {
						results.push({
							type: 'transaction',
							hash: query,
							timestamp: undefined,
						})
					}
				} else {
					// search for token matches (even if an address was found)
					results.push(...searchTokens(query, chainId))
				}

				return Response.json({ results, query } satisfies SearchApiResponse, {
					headers: { 'Cache-Control': 'public, max-age=30' },
				})
			},
		},
	},
})
