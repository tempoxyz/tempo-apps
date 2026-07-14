import { createServerFn } from '@tanstack/react-start'
import { parseResponse } from 'hono/client'
import type { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { getAccountTag } from '#lib/account'
import { api } from '#lib/server/tempo-api'
import { parseTimestamp } from '#lib/timestamp'
import { getWagmiConfig } from '#wagmi.config.ts'

export type Token = {
	address: Address.Address
	symbol: string
	name: string
	currency: string
	logoURI?: string | undefined
	createdAt?: number | undefined
	holdersCount?: number
}

const FetchTokensInputSchema = z.object({
	page: z.coerce.number().check(z.gte(1)),
	limit: z.coerce.number().check(z.gte(1), z.lte(25)),
})

export type TokensApiResponse = {
	tokens: Token[]
	total: number
}

function isGenesisTokenAddress(address: Address.Address): boolean {
	return getAccountTag(address)?.id.startsWith('genesis-token:') ?? false
}

/**
 * Max page size accepted by the Tempo API's list endpoints. The curated
 * verified-token list is small enough to fetch in one call, so request the
 * whole list at once and paginate locally. (Without an explicit `limit` the
 * API defaults to 10, which silently truncated the page to a single page.)
 */
const VERIFIED_TOKENS_MAX_LIMIT = 200

export const fetchTokens = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokensInputSchema.parse(input))
	.handler(async ({ data }): Promise<TokensApiResponse> => {
		const { page, limit } = data
		const offset = (page - 1) * limit

		const chainId = getChainId(getWagmiConfig())

		// One verified-list call carries everything the page renders: the API
		// resolves logos (curated icon → on-chain `logoURI`), currencies, and
		// the requested per-token enrichments.
		//
		// `createdAt` is intentionally omitted: for the hyper-active genesis
		// tokens it makes the API scan for a (nonexistent) `TokenCreated` event,
		// adding ~5s to the blocking loader while returning null. Creation time
		// is derived from `transferStats.firstAt` (fast) with a genesis-block
		// fallback below.
		const tokens = await parseResponse(
			api.v1.tokens.$get({
				query: {
					chainId: String(chainId),
					verified: 'true',
					include: 'holderCount,transferStats',
					limit: String(VERIFIED_TOKENS_MAX_LIMIT),
				},
			}),
		)
			.then((response) => response.data)
			.catch((error) => {
				console.error('Failed to fetch verified tokens:', error)
				return []
			})

		const pageTokens = tokens.slice(offset, offset + limit)

		// Genesis tokens have no `TokenCreated` event; when one also has no
		// transfer history, fall back to the genesis block timestamp.
		const needsGenesisCreatedAt = pageTokens.some(
			(token) =>
				!token.transferStats?.firstAt &&
				!token.createdAt &&
				isGenesisTokenAddress(token.address as Address.Address),
		)
		const genesisCreatedAt = needsGenesisCreatedAt
			? await parseResponse(
					api.v1.blocks.$get({
						query: { chainId: String(chainId), limit: '5', order: 'asc' },
					}),
				)
					.then((response) => parseTimestamp(response.data[0]?.timestamp))
					.catch((error) => {
						console.error('Failed to fetch genesis block timestamp:', error)
						return undefined
					})
			: undefined

		return {
			total: tokens.length,
			tokens: pageTokens.map((token) => {
				const address = token.address as Address.Address

				return {
					address,
					symbol: token.symbol,
					name: token.name,
					currency: token.currency,
					logoURI: token.logoUri,
					createdAt:
						parseTimestamp(token.transferStats?.firstAt) ??
						parseTimestamp(token.createdAt) ??
						(isGenesisTokenAddress(address) ? genesisCreatedAt : undefined),
					holdersCount: token.holderCount,
				}
			}),
		}
	})
