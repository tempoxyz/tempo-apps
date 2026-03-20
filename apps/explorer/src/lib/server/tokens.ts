import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import {
	type TokenCreatedRow,
	fetchTokenCreatedRows,
	fetchTokenHoldersCountRows,
} from '#lib/server/tempo-queries'
import { TOKENLIST_URLS } from '#lib/tokenlist'
import { getWagmiConfig } from '#wagmi.config.ts'

export type Token = {
	address: Address.Address
	symbol: string
	name: string
	currency: string
	createdAt: number
	holdersCount?: number
	holdersCountCapped?: boolean
}

const FetchTokensInputSchema = z.object({
	offset: z.coerce.number().check(z.gte(0)),
	limit: z.coerce.number().check(z.gte(1), z.lte(25)),
})

export type TokensApiResponse = {
	tokens: Token[]
	offset: number
	limit: number
}

const SPAM_TOKEN_PATTERN = /\btest|test\b|\bfake|fake\b/i

function isSpamToken(row: TokenCreatedRow): boolean {
	return (
		SPAM_TOKEN_PATTERN.test(row.name) || SPAM_TOKEN_PATTERN.test(row.symbol)
	)
}

/** Mainnet chain ID */
const TEMPO_MAINNET_CHAIN_ID = 4217

type TokenListEntry = {
	address: string
}

type TokenListResponse = {
	tokens: TokenListEntry[]
}

let cachedTokenList:
	| { chainId: number; addresses: Set<string>; ts: number }
	| undefined

export async function getTokenListAddresses(
	chainId: number,
): Promise<Set<string>> {
	const now = Date.now()
	if (
		cachedTokenList?.chainId === chainId &&
		now - cachedTokenList.ts < 5 * 60_000
	) {
		return cachedTokenList.addresses
	}

	const url = TOKENLIST_URLS[chainId]
	if (!url) return new Set()

	try {
		const res = await fetch(url)
		if (!res.ok) return cachedTokenList?.addresses ?? new Set()
		const data = (await res.json()) as TokenListResponse
		const addresses = new Set(data.tokens.map((t) => t.address.toLowerCase()))
		cachedTokenList = { chainId, addresses, ts: now }
		return addresses
	} catch {
		return cachedTokenList?.addresses ?? new Set()
	}
}

export const fetchTokens = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokensInputSchema.parse(input))
	.handler(async ({ data }): Promise<TokensApiResponse> => {
		const { offset, limit } = data

		const config = getWagmiConfig()
		const chainId = getChainId(config)

		const shouldFilter = chainId === TEMPO_MAINNET_CHAIN_ID

		// Fetch tokenlist addresses and DB rows in parallel
		const [tokenListAddresses, allRows] = await Promise.all([
			getTokenListAddresses(chainId),
			fetchAllFilteredRows(chainId, shouldFilter),
		])

		// Partition: tokenlist tokens first (preserving tokenlist order), then rest by creation date
		let sorted: TokenCreatedRow[]
		if (tokenListAddresses.size > 0) {
			const listed: TokenCreatedRow[] = []
			const rest: TokenCreatedRow[] = []
			for (const row of allRows) {
				if (tokenListAddresses.has(row.token.toLowerCase())) {
					listed.push(row)
				} else {
					rest.push(row)
				}
			}
			// Sort listed tokens by their position in the tokenlist
			const addressOrder = [...tokenListAddresses]
			listed.sort(
				(a, b) =>
					addressOrder.indexOf(a.token.toLowerCase()) -
					addressOrder.indexOf(b.token.toLowerCase()),
			)
			sorted = [...listed, ...rest]
		} else {
			sorted = allRows
		}

		const tokensResult = sorted.slice(offset, offset + limit)

		const holdersCounts = new Map<string, { count: number; capped: boolean }>()

		if (tokensResult.length > 0) {
			try {
				const holdersResults = await fetchTokenHoldersCountRows(
					tokensResult.map((row) => row.token as Address.Address),
					chainId,
					TOKEN_COUNT_MAX,
				)

				for (const entry of holdersResults) {
					holdersCounts.set(entry.token, {
						count: entry.count,
						capped: entry.capped,
					})
				}
			} catch (error) {
				console.error('Failed to fetch holders counts:', error)
			}
		}

		return {
			offset,
			limit,
			tokens: tokensResult.map(
				({ token: address, block_timestamp, ...rest }) => ({
					...rest,
					address,
					createdAt: Number(block_timestamp),
					holdersCount: holdersCounts.get(address.toLowerCase())?.count,
					holdersCountCapped: holdersCounts.get(address.toLowerCase())?.capped,
				}),
			),
		}
	})

async function fetchAllFilteredRows(
	chainId: number,
	shouldFilter: boolean,
): Promise<TokenCreatedRow[]> {
	if (!shouldFilter) {
		return fetchTokenCreatedRows(chainId, TOKEN_COUNT_MAX, 0)
	}

	const batchSize = 100
	const collected: TokenCreatedRow[] = []
	let dbOffset = 0

	while (collected.length < TOKEN_COUNT_MAX) {
		const batch = await fetchTokenCreatedRows(chainId, batchSize, dbOffset)
		if (batch.length === 0) break

		for (const row of batch) {
			if (!isSpamToken(row)) {
				collected.push(row)
			}
		}
		dbOffset += batch.length

		if (dbOffset > TOKEN_COUNT_MAX * 10) break
	}

	return collected
}
