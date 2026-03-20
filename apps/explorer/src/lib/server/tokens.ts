import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import {
	type TokenCreatedRow,
	fetchTokenCreatedRows,
	fetchTokenCreatedRowsByAddresses,
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

/** Devnet chain ID – TIDX does not index devnet */
const TEMPO_DEVNET_CHAIN_ID = 31318

type TokenListEntry = {
	address: string
	name: string
	symbol: string
}

type TokenListResponse = {
	tokens: TokenListEntry[]
}

let cachedTokenList:
	| {
			chainId: number
			entries: TokenListEntry[]
			addresses: Set<string>
			ts: number
	  }
	| undefined

async function fetchTokenList(
	chainId: number,
): Promise<{ entries: TokenListEntry[]; addresses: Set<string> }> {
	const now = Date.now()
	if (
		cachedTokenList?.chainId === chainId &&
		now - cachedTokenList.ts < 5 * 60_000
	) {
		return cachedTokenList
	}

	const url = TOKENLIST_URLS[chainId]
	if (!url) return { entries: [], addresses: new Set() }

	try {
		const res = await fetch(url)
		if (!res.ok) return cachedTokenList ?? { entries: [], addresses: new Set() }
		const data = (await res.json()) as TokenListResponse
		const entries = data.tokens
		const addresses = new Set(entries.map((t) => t.address.toLowerCase()))
		cachedTokenList = { chainId, entries, addresses, ts: now }
		return { entries, addresses }
	} catch {
		return cachedTokenList ?? { entries: [], addresses: new Set() }
	}
}

export async function getTokenListAddresses(
	chainId: number,
): Promise<Set<string>> {
	const { addresses } = await fetchTokenList(chainId)
	return addresses
}

export const fetchTokens = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokensInputSchema.parse(input))
	.handler(async ({ data }): Promise<TokensApiResponse> => {
		const { offset, limit } = data

		const config = getWagmiConfig()
		const chainId = getChainId(config)

		// Devnet: tokenlist only (TIDX does not index devnet)
		if (chainId === TEMPO_DEVNET_CHAIN_ID) {
			const { entries } = await fetchTokenList(chainId)
			const page = entries.slice(offset, offset + limit)
			return {
				offset,
				limit,
				tokens: page.map((entry) => ({
					address: entry.address as Address.Address,
					symbol: entry.symbol,
					name: entry.name,
					currency: '',
					createdAt: 0,
				})),
			}
		}

		const shouldFilter = chainId === TEMPO_MAINNET_CHAIN_ID

		// Fetch tokenlist and DB rows in parallel
		const [{ entries, addresses: tokenListAddresses }, allRows] =
			await Promise.all([
				fetchTokenList(chainId),
				fetchAllFilteredRows(chainId, shouldFilter),
			])

		// Partition: tokenlist tokens first (preserving tokenlist order), then rest by creation date
		// Track fallback tokens (not in TIDX) so we exclude them from TIDX holder queries
		const fallbackAddresses = new Set<string>()
		let sorted: TokenCreatedRow[]
		if (tokenListAddresses.size > 0) {
			const listed: TokenCreatedRow[] = []
			const rest: TokenCreatedRow[] = []
			const foundAddresses = new Set<string>()
			for (const row of allRows) {
				if (tokenListAddresses.has(row.token.toLowerCase())) {
					listed.push(row)
					foundAddresses.add(row.token.toLowerCase())
				} else {
					rest.push(row)
				}
			}

			// Fetch TIDX data for tokenlist tokens missing from the batch
			const missingEntries = entries.filter(
				(e) => !foundAddresses.has(e.address.toLowerCase()),
			)
			if (missingEntries.length > 0) {
				const missingAddresses = missingEntries.map(
					(e) => e.address as Address.Address,
				)
				let missingRows: TokenCreatedRow[] = []
				try {
					missingRows =
						await fetchTokenCreatedRowsByAddresses(chainId, missingAddresses)
				} catch {}
				// For any still missing (e.g. predeployed system tokens with no creation event), use tokenlist data
				const fetchedAddresses = new Set(
					missingRows.map((r) => r.token.toLowerCase()),
				)
				for (const entry of missingEntries) {
					if (!fetchedAddresses.has(entry.address.toLowerCase())) {
						missingRows.push({
							token: entry.address as `0x${string}`,
							name: entry.name,
							symbol: entry.symbol,
							currency: '',
							block_timestamp: 0,
						})
						fallbackAddresses.add(entry.address.toLowerCase())
					}
				}
				listed.push(...missingRows)
			}

			// Sort listed tokens by their position in the tokenlist
			const addressOrder = [...tokenListAddresses]
			listed.sort(
				(a, b) =>
					addressOrder.indexOf(a.token.toLowerCase()) -
					addressOrder.indexOf(b.token.toLowerCase()),
			)
			// Mainnet: only show tokenlist tokens
			// Testnet: tokenlist tokens first, then the rest
			sorted = shouldFilter ? listed : [...listed, ...rest]
		} else {
			sorted = allRows
		}

		const tokensResult = sorted.slice(offset, offset + limit)

		const holdersCounts = new Map<string, { count: number; capped: boolean }>()

		// Only query TIDX for holders of tokens that have TIDX data (exclude fallback tokens)
		const tidxTokenAddresses = tokensResult
			.filter((row) => !fallbackAddresses.has(row.token.toLowerCase()))
			.map((row) => row.token as Address.Address)

		if (tidxTokenAddresses.length > 0) {
			try {
				const holdersResults = await fetchTokenHoldersCountRows(
					tidxTokenAddresses,
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
