import { createServerFn } from '@tanstack/react-start'
import { type InferResponseType, parseResponse } from 'hono/client'
import type { Address, Hex } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { api } from '#lib/server/tempo-api'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config.ts'

const CACHE_TTL = 60_000
const CACHE_MAX_ENTRIES = 20
const COUNT_CAP = TOKEN_COUNT_MAX

type TokenDetails = InferResponseType<
	(typeof api.v1.tokens)[':token']['$get'],
	200
>

type CacheEntry<T> = { data: T; timestamp: number }

function setCached<T>(
	cache: Map<string, CacheEntry<T>>,
	key: string,
	data: T,
): void {
	if (!cache.has(key) && cache.size >= CACHE_MAX_ENTRIES) {
		const oldestKey = cache.keys().next().value
		if (oldestKey) cache.delete(oldestKey)
	}
	cache.delete(key)
	cache.set(key, { data, timestamp: Date.now() })
}

const tokenDetailsCache = new Map<
	string,
	CacheEntry<TokenDetails | undefined>
>()

/**
 * Cached token detail lookup shared by the holders / transfers server fns:
 * exact `holderCount`, `totalSupply`, the `TokenCreated` timestamp, and
 * lifetime `transferStats`.
 */
async function getTokenDetails(
	chainId: number,
	address: Address.Address,
): Promise<TokenDetails | undefined> {
	const cacheKey = `${chainId}-${address}`
	const cached = tokenDetailsCache.get(cacheKey)
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data

	const details = await parseResponse(
		api.v1.tokens[':token'].$get({
			param: { token: address },
			query: {
				chainId: String(chainId),
				include: 'createdAt,holderCount,transferStats',
			},
		}),
	).catch((error) => {
		console.error(`Failed to fetch token details for ${address}:`, error)
		return undefined
	})

	setCached(tokenDetailsCache, cacheKey, details)
	return details
}

/**
 * Resolves `total`/`totalCapped` for the numbered-pagination UI: prefer the
 * exact count when the API provides one, otherwise infer from the fetched
 * page (exact when the feed ends inside it). Totals are clamped to the
 * largest page-aligned row count inside the API's positional window so every
 * page the UI offers stays requestable.
 */
export function resolveTotal(options: {
	exactCount: number | undefined
	exactCountCapped?: boolean | undefined
	page: number
	limit: number
	rows: number
	exhausted: boolean
}): { total: number; totalCapped: boolean } {
	const { exactCount, exactCountCapped, page, limit, rows, exhausted } = options
	const maxNavigableRows = Math.floor(COUNT_CAP / limit) * limit
	if (exactCount !== undefined) {
		const totalCapped =
			Boolean(exactCountCapped) || exactCount > maxNavigableRows
		return {
			total: totalCapped ? maxNavigableRows : exactCount,
			totalCapped,
		}
	}
	if (exhausted)
		return {
			total: Math.min((page - 1) * limit + rows, maxNavigableRows),
			totalCapped: false,
		}
	return { total: maxNavigableRows, totalCapped: true }
}

const FetchTokenHoldersInputSchema = z.object({
	address: zAddress({ lowercase: true }),
	page: z.coerce.number().check(z.gte(1)),
	limit: z.coerce.number().check(z.gte(5), z.lte(200)),
})

export type FetchTokenHoldersInput = z.infer<
	typeof FetchTokenHoldersInputSchema
>

export type TokenHoldersApiResponse = {
	holders: Array<{
		address: Address.Address
		balance: string
	}>
	total: number
	totalCapped: boolean
	totalBalance: string
}

const EMPTY_HOLDERS_RESPONSE: TokenHoldersApiResponse = {
	holders: [],
	total: 0,
	totalCapped: false,
	totalBalance: '0',
}

export const fetchHolders = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenHoldersInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			if (data.page * data.limit > COUNT_CAP) return EMPTY_HOLDERS_RESPONSE
			const chainId = getChainId(getWagmiConfig())

			const [details, page] = await Promise.all([
				getTokenDetails(chainId, data.address),
				parseResponse(
					api.v1.tokens[':token'].holders.$get({
						param: { token: data.address },
						query: {
							chainId: String(chainId),
							limit: String(data.limit),
							page: String(data.page),
						},
					}),
				),
			])

			return {
				holders: page.data.map((holder) => ({
					address: holder.address as Address.Address,
					balance: holder.balance,
				})),
				...resolveTotal({
					exactCount: details?.holderCount,
					page: data.page,
					limit: data.limit,
					rows: page.data.length,
					exhausted: page.nextCursor === null,
				}),
				totalBalance: details?.totalSupply ?? '0',
			}
		} catch (error) {
			console.error('Failed to fetch holders:', error)
			return EMPTY_HOLDERS_RESPONSE
		}
	})

const FetchTokenTransfersInputSchema = z.object({
	address: zAddress({ lowercase: true }),
	page: z.coerce.number().check(z.gte(1)),
	limit: z.coerce.number().check(z.gte(5), z.lte(200)),
	account: z.optional(zAddress({ lowercase: true })),
})

export type FetchTokenTransfersInput = z.infer<
	typeof FetchTokenTransfersInputSchema
>

export type TokenTransfersApiResponse = {
	transfers: Array<{
		from: Address.Address
		to: Address.Address
		value: string
		transactionHash: Hex.Hex
		blockNumber: string
		timestamp: string | null
	}>
	total: number
	totalCapped: boolean
}

const EMPTY_TRANSFERS_RESPONSE: TokenTransfersApiResponse = {
	transfers: [],
	total: 0,
	totalCapped: false,
}

const FetchAccountTransfersInputSchema = z.object({
	account: zAddress({ lowercase: true }),
	page: z.coerce.number().check(z.gte(1)),
	limit: z.coerce.number().check(z.gte(5), z.lte(200)),
})

export type AccountTransfersApiResponse = {
	transfers: Array<{
		from: Address.Address
		to: Address.Address
		value: string
		transactionHash: Hex.Hex
		blockNumber: string
		timestamp: string | null
		token: {
			address: Address.Address
			symbol: string
			decimals: number
			currency: string
		}
	}>
	total: number
	totalCapped: boolean
}

const EMPTY_ACCOUNT_TRANSFERS_RESPONSE: AccountTransfersApiResponse = {
	transfers: [],
	total: 0,
	totalCapped: false,
}

/**
 * Token transfers where the account is sender or recipient, across all
 * tokens (the address page's account-scoped Transfers tab). Rows span
 * multiple contracts, so each carries its token's symbol/decimals.
 */
export const fetchAccountTransfers = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchAccountTransfersInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			if (data.page * data.limit > COUNT_CAP)
				return EMPTY_ACCOUNT_TRANSFERS_RESPONSE
			const chainId = getChainId(getWagmiConfig())

			const page = await parseResponse(
				api.v1.transfers.$get({
					query: {
						chainId: String(chainId),
						address: data.account,
						limit: String(data.limit),
						page: String(data.page),
						include: 'totalCount',
					},
				}),
			)

			return {
				transfers: page.data.map((transfer) => ({
					from: transfer.sender as Address.Address,
					to: transfer.recipient as Address.Address,
					value: transfer.sourceAmount.baseUnits,
					transactionHash: transfer.transactionHash as Hex.Hex,
					blockNumber: String(transfer.blockNumber),
					timestamp: transfer.timestamp ?? null,
					token: {
						address: transfer.sourceToken.address as Address.Address,
						symbol: transfer.sourceToken.symbol,
						decimals: transfer.sourceToken.decimals,
						currency: transfer.sourceToken.currency,
					},
				})),
				...resolveTotal({
					exactCount: page.meta?.totalCount,
					exactCountCapped: page.meta?.totalCountCapped,
					page: data.page,
					limit: data.limit,
					rows: page.data.length,
					exhausted: page.nextCursor === null,
				}),
			}
		} catch (error) {
			console.error('Failed to fetch account transfers:', error)
			return EMPTY_ACCOUNT_TRANSFERS_RESPONSE
		}
	})

export const fetchTransfers = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenTransfersInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			if (data.page * data.limit > COUNT_CAP) return EMPTY_TRANSFERS_RESPONSE
			const chainId = getChainId(getWagmiConfig())

			const [details, page] = await Promise.all([
				getTokenDetails(chainId, data.address),
				parseResponse(
					api.v1.transfers.$get({
						query: {
							token: data.address,
							chainId: String(chainId),
							limit: String(data.limit),
							page: String(data.page),
							...(data.account
								? { address: data.account, include: 'totalCount' }
								: {}),
						},
					}),
				),
			])

			return {
				transfers: page.data.map((transfer) => ({
					from: transfer.sender as Address.Address,
					to: transfer.recipient as Address.Address,
					value: transfer.sourceAmount.baseUnits,
					transactionHash: transfer.transactionHash as Hex.Hex,
					blockNumber: String(transfer.blockNumber),
					timestamp: transfer.timestamp ?? null,
				})),
				...resolveTotal({
					exactCount: data.account
						? page.meta?.totalCount
						: details?.transferStats?.count,
					exactCountCapped: data.account
						? page.meta?.totalCountCapped
						: undefined,
					page: data.page,
					limit: data.limit,
					rows: page.data.length,
					exhausted: page.nextCursor === null,
				}),
			}
		} catch (error) {
			console.error('Failed to fetch transfers:', error)
			return EMPTY_TRANSFERS_RESPONSE
		}
	})
