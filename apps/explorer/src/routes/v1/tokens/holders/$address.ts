import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { Address } from 'ox'
import { zeroAddress } from 'viem'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import type { TokenHolder } from '../../_types'
import {
	badRequest,
	corsPreflightResponse,
	DEFAULT_LIMIT,
	MAX_LIMIT,
	paginatedResponse,
	serverError,
} from '../../_utils'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

const holdersCache = new Map<
	string,
	{
		data: Array<{ address: string; balance: bigint }>
		timestamp: number
	}
>()

const CACHE_TTL = 60_000

const QuerySchema = z.object({
	offset: z.prefault(z.coerce.number(), 0),
	limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
})

export const Route = createFileRoute('/v1/tokens/holders/$address')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async ({ params, request }) => {
				try {
					const parseResult = zAddress({ lowercase: true }).safeParse(
						params.address,
					)
					if (!parseResult.success) {
						return badRequest('Invalid address format')
					}
					const address = parseResult.data

					const url = new URL(request.url)
					const queryResult = QuerySchema.safeParse(
						Object.fromEntries(url.searchParams),
					)
					if (!queryResult.success) {
						return badRequest('Invalid query parameters', queryResult.error)
					}

					const query = queryResult.data
					const limit = Math.min(Math.max(query.limit, 1), MAX_LIMIT)
					const offset = Math.max(query.offset, 0)

					const config = getWagmiConfig()
					const chainId = getChainId(config)
					const cacheKey = `${chainId}-${address}`

					const cached = holdersCache.get(cacheKey)
					const now = Date.now()

					let allHolders: Array<{ address: string; balance: bigint }>

					if (cached && now - cached.timestamp < CACHE_TTL) {
						allHolders = cached.data
					} else {
						allHolders = await fetchHoldersData(address, chainId)
						holdersCache.set(cacheKey, {
							data: allHolders,
							timestamp: now,
						})
					}

					const paginatedHolders = allHolders.slice(offset, offset + limit)
					const holders: TokenHolder[] = paginatedHolders.map((holder) => ({
						address: holder.address as Address.Address,
						balance: holder.balance.toString(),
					}))

					const total = Math.min(allHolders.length, TOKEN_COUNT_MAX)
					const hasMore = offset + holders.length < total

					return paginatedResponse(holders, {
						total,
						offset: offset + holders.length,
						limit,
						hasMore,
					})
				} catch (error) {
					console.error('Token holders error:', error)
					return serverError('Failed to fetch token holders')
				}
			},
		},
	},
})

async function fetchHoldersData(address: Address.Address, chainId: number) {
	const qb = QB.withSignatures([TRANSFER_SIGNATURE])

	const outgoing = await qb
		.selectFrom('transfer')
		.select((eb) => [
			eb.ref('from').as('holder'),
			eb.fn.sum('tokens').as('sent'),
		])
		.where('chain', '=', chainId)
		.where('address', '=', address)
		.where('from', '<>', zeroAddress)
		.groupBy('from')
		.execute()

	const incoming = await qb
		.selectFrom('transfer')
		.select((eb) => [
			eb.ref('to').as('holder'),
			eb.fn.sum('tokens').as('received'),
		])
		.where('chain', '=', chainId)
		.where('address', '=', address)
		.groupBy('to')
		.execute()

	const balances = new Map<string, bigint>()

	for (const row of incoming) {
		const holder = row.holder
		const received = BigInt(row.received)
		balances.set(holder, (balances.get(holder) ?? 0n) + received)
	}

	for (const row of outgoing) {
		const holder = row.holder
		const sent = BigInt(row.sent)
		balances.set(holder, (balances.get(holder) ?? 0n) - sent)
	}

	return Array.from(balances.entries())
		.filter(([, balance]) => balance > 0n)
		.map(([holder, balance]) => ({ address: holder, balance }))
		.sort((a, b) => (b.balance > a.balance ? 1 : -1))
}
