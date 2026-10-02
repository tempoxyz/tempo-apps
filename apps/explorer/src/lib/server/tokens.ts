import { createServerFn } from '@tanstack/react-start'
import { parseResponse } from 'hono/client'
import { type Address, Value } from 'ox'
import { getChainId, readContracts } from 'wagmi/actions'
import * as z from 'zod/mini'
import { Abis } from '#lib/abis'
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
	/** Circulating (total) supply as a decimal string in token units. */
	circulatingSupply?: string | undefined
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
 * Order tokens by circulating supply, largest first.
 * Supplies are only comparable within one currency, so USD-denominated tokens
 * rank ahead of the rest; tokens without a known supply go last. Ties keep
 * their input order.
 */
export function sortTokensByCirculatingSupply<
	token extends Pick<Token, 'currency' | 'circulatingSupply'>,
>(tokens: readonly token[]): token[] {
	const rank = (token: token) => [
		token.circulatingSupply === undefined
			? 2
			: token.currency === 'USD'
				? 0
				: 1,
		Number(token.circulatingSupply ?? 0),
	]
	return tokens.toSorted((a, b) => {
		const [aGroup, aSupply] = rank(a)
		const [bGroup, bSupply] = rank(b)
		return aGroup - bGroup || bSupply - aSupply
	})
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

		const config = getWagmiConfig()
		const chainId = getChainId(config)

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

		// The verified-list endpoint does not return `totalSupply`, so read it
		// onchain in one batched request. Failed reads leave the supply unknown.
		const supplies = await readContracts(config, {
			contracts: tokens.map(
				(token) =>
					({
						address: token.address as Address.Address,
						abi: Abis.tip20,
						functionName: 'totalSupply',
					}) as const,
			),
		}).catch((error) => {
			console.error('Failed to fetch token supplies:', error)
			return []
		})
		const sortedTokens = sortTokensByCirculatingSupply(
			tokens.map((token, index) => {
				const supply = supplies[index]
				return {
					...token,
					circulatingSupply:
						supply?.status === 'success'
							? Value.format(supply.result, token.decimals)
							: undefined,
				}
			}),
		)

		const pageTokens = sortedTokens.slice(offset, offset + limit)

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
					circulatingSupply: token.circulatingSupply,
				}
			}),
		}
	})
