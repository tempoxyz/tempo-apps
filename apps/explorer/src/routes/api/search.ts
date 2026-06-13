import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import {
	getBlock,
	getBlockNumber,
	getChainId,
	getTransaction,
} from 'wagmi/actions'
import { isTip20Address } from '#lib/domain/tip20'
import { normalizeSearchInput } from '#lib/tempo-address'
import { getVerifiedTokens } from '#lib/server/verified-tokens'
import { getWagmiConfig } from '#wagmi.config.ts'

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
	| {
			type: 'block'
			blockNumber: number
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
export type BlockSearchResult = Extract<SearchResult, { type: 'block' }>

type IndexedToken = {
	address: Address.Address
	symbol: string
	name: string
	searchKey: string
}

/** The slice of a verified-token row that token search matches against. */
export type SearchTokenEntry = {
	address: string
	symbol: string
	name: string
}

function indexSearchTokenEntries(tokens: SearchTokenEntry[]): IndexedToken[] {
	return tokens.map((token) => ({
		address: token.address.toLowerCase() as Address.Address,
		symbol: token.symbol,
		name: token.name,
		searchKey: `${token.symbol.toLowerCase()}|${token.name.toLowerCase()}|${token.address.toLowerCase()}`,
	}))
}

function mergeIndexedTokens(tokens: IndexedToken[]): IndexedToken[] {
	const tokensByAddress = new Map<string, IndexedToken>()
	for (const token of tokens) {
		tokensByAddress.set(token.address.toLowerCase(), token)
	}
	return [...tokensByAddress.values()]
}

export function searchTokens(
	query: string,
	verifiedTokens: SearchTokenEntry[],
): TokenSearchResult[] {
	query = query.toLowerCase()
	const verifiedAddresses = new Set(
		verifiedTokens.map((token) => token.address.toLowerCase()),
	)
	const indexedTokens = mergeIndexedTokens(
		indexSearchTokenEntries(verifiedTokens),
	)
	const isAddressQuery = query.startsWith('0x')

	// filter using search keys
	const matches = indexedTokens.filter((token) => {
		if (isAddressQuery) return token.address.startsWith(query)
		// for name/symbol queries, only match verified tokens
		if (verifiedAddresses.size > 0 && !verifiedAddresses.has(token.address))
			return false
		return token.searchKey.includes(query)
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
				const rawQuery = url.searchParams.get('q')?.trim() ?? ''
				const query = normalizeSearchInput(rawQuery)

				if (!query)
					return Response.json({
						results: [],
						query: rawQuery,
					} satisfies SearchApiResponse)

				const config = getWagmiConfig()
				const chainId = getChainId(config)
				const verifiedTokens = await getVerifiedTokens(chainId)
				const results: SearchResult[] = []

				// block number (plain digits or #-prefixed)
				const blockQuery = query.startsWith('#') ? query.slice(1).trim() : query
				const blockNumber = /^\d+$/.test(blockQuery)
					? Number(blockQuery)
					: Number.NaN
				if (
					Number.isFinite(blockNumber) &&
					Number.isSafeInteger(blockNumber) &&
					blockNumber >= 0
				) {
					try {
						const latestBlock = await getBlockNumber(config)
						if (blockNumber <= Number(latestBlock))
							results.push({ type: 'block', blockNumber })
					} catch {
						// node unavailable — skip block result
					}
				}

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
					let timestamp: number | undefined
					try {
						const transaction = await getTransaction(config, { hash: query })
						if (transaction.blockNumber) {
							const block = await getBlock(config, {
								blockNumber: transaction.blockNumber,
							})
							timestamp = Number(block.timestamp)
						}
					} catch {
						// unknown or pending — return the hash without a timestamp
					}

					results.push({ type: 'transaction', hash: query, timestamp })
				} else {
					// search for token matches (even if an address was found)
					results.push(...searchTokens(query, verifiedTokens))
				}

				return Response.json(
					{ results, query: rawQuery } satisfies SearchApiResponse,
					{
						headers: { 'Cache-Control': 'public, max-age=30' },
					},
				)
			},
		},
	},
})
