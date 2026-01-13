import { createServerFn } from '@tanstack/react-start'
import * as IDX from 'idxs'
import type { Address, Hex } from 'ox'
import { zeroAddress } from 'viem'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]
const CACHE_TTL = 60_000
const OG_CACHE_TTL = 3_600_000 // 1 hour
const COUNT_CAP = TOKEN_COUNT_MAX

const holdersCache = new Map<
	string,
	{
		data: {
			allHolders: Array<{ address: string; balance: bigint }>
		}
		timestamp: number
	}
>()

const firstTransferCache = new Map<
	string,
	{
		data: string | null
		timestamp: number
	}
>()

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

const FetchTokenHoldersInputSchema = z.object({
	address: zAddress({ lowercase: true }),
	offset: z.coerce.number().check(z.gte(0)),
	limit: z.coerce.number().check(z.gte(1), z.lte(MAX_LIMIT)),
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
	offset: number
	limit: number
}

const EMPTY_HOLDERS_RESPONSE: TokenHoldersApiResponse = {
	holders: [],
	total: 0,
	totalCapped: false,
	offset: 0,
	limit: 0,
}

export const fetchHolders = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenHoldersInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			const config = getWagmiConfig()
			const chainId = getChainId(config)
			const cacheKey = `${chainId}-${data.address}`

			const cached = holdersCache.get(cacheKey)
			const now = Date.now()

			let allHolders: Array<{ address: string; balance: bigint }>

			if (cached && now - cached.timestamp < CACHE_TTL) {
				allHolders = cached.data.allHolders
			} else {
				allHolders = await fetchHoldersData(data.address, chainId)

				holdersCache.set(cacheKey, {
					data: { allHolders },
					timestamp: now,
				})
			}

			const paginatedHolders = allHolders.slice(
				data.offset,
				data.offset + data.limit,
			)

			const holders = paginatedHolders.map((holder) => ({
				address: holder.address as Address.Address,
				balance: holder.balance.toString(),
			}))

			const rawTotal = allHolders.length
			const totalCapped = rawTotal >= COUNT_CAP
			const total = totalCapped ? COUNT_CAP : rawTotal
			const nextOffset = data.offset + holders.length

			return {
				holders,
				total,
				totalCapped,
				offset: nextOffset,
				limit: holders.length,
			}
		} catch (error) {
			console.error('Failed to fetch holders:', error)
			return EMPTY_HOLDERS_RESPONSE
		}
	})

async function fetchHoldersData(address: Address.Address, chainId: number) {
	// Aggregate balances directly in the indexer instead of streaming every transfer.
	const qb = QB.withSignatures([TRANSFER_SIGNATURE])

	// Sum outgoing per holder (exclude mints from zero)
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

	// Sum incoming per holder
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

async function fetchFirstTransferData(
	address: Address.Address,
	chainId: number,
): Promise<string | null> {
	const cacheKey = `${chainId}-${address}`
	const cached = firstTransferCache.get(cacheKey)
	const now = Date.now()

	if (cached && now - cached.timestamp < CACHE_TTL) {
		return cached.data
	}

	const qb = QB.withSignatures([TRANSFER_SIGNATURE])

	const firstTransfer = await qb
		.selectFrom('transfer')
		.select(['block_timestamp'])
		.where('chain', '=', chainId)
		.where('address', '=', address)
		.orderBy('block_num', 'asc')
		.limit(1)
		.executeTakeFirst()

	let created: string | null = null
	if (firstTransfer?.block_timestamp) {
		const date = new Date(Number(firstTransfer.block_timestamp) * 1000)
		created = date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		})
	}

	firstTransferCache.set(cacheKey, {
		data: created,
		timestamp: now,
	})

	return created
}

const FetchFirstTransferInputSchema = z.object({
	address: zAddress({ lowercase: true }),
})

export type FetchFirstTransferInput = z.infer<
	typeof FetchFirstTransferInputSchema
>

export type FirstTransferApiResponse = {
	created: string | null
}

export const fetchFirstTransfer = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchFirstTransferInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			const config = getWagmiConfig()
			const chainId = getChainId(config)
			const created = await fetchFirstTransferData(data.address, chainId)
			return { created }
		} catch (error) {
			console.error('Failed to fetch first transfer:', error)
			return { created: null }
		}
	})

const FetchTokenTransfersInputSchema = z.object({
	address: zAddress({ lowercase: true }),
	offset: z.coerce.number().check(z.gte(0)),
	limit: z.coerce.number().check(z.gte(1), z.lte(MAX_LIMIT)),
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
		logIndex: number
		timestamp: string | null
	}>
	total: number
	totalCapped: boolean
	offset: number
	limit: number
}

const EMPTY_TRANSFERS_RESPONSE: TokenTransfersApiResponse = {
	transfers: [],
	total: 0,
	totalCapped: false,
	offset: 0,
	limit: 0,
}

export const fetchTransfers = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenTransfersInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			const config = getWagmiConfig()
			const chainId = getChainId(config)

			const [transfers, countResult] = await Promise.all([
				fetchTransfersData(
					data.address,
					data.limit,
					data.offset,
					chainId,
					data.account,
				).catch((error) => {
					console.error('Failed to fetch transfers data:', error)
					return []
				}),
				fetchTotalCount(data.address, chainId, data.account).catch((error) => {
					console.error('Failed to fetch transfers count:', error)
					return { count: 0, capped: false }
				}),
			])

			const nextOffset = data.offset + (transfers?.length ?? 0)

			return {
				transfers,
				total: countResult.count,
				totalCapped: countResult.capped,
				offset: nextOffset,
				limit: transfers?.length ?? 0,
			}
		} catch (error) {
			console.error('Failed to fetch transfers:', error)
			return EMPTY_TRANSFERS_RESPONSE
		}
	})

async function fetchTransfersData(
	address: Address.Address,
	limit: number,
	offset: number,
	chainId: number,
	account?: Address.Address,
) {
	let query = QB.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select([
			'from',
			'to',
			'tokens',
			'tx_hash',
			'block_num',
			'log_idx',
			'block_timestamp',
		])
		.where('chain', '=', chainId)
		.where('address', '=', address)

	if (account) {
		query = query.where((eb) =>
			eb.or([eb('from', '=', account), eb('to', '=', account)]),
		)
	}

	const result = await query
		.orderBy('block_num', 'desc')
		.orderBy('log_idx', 'desc')
		.limit(limit)
		.offset(offset)
		.execute()

	return result.map((row) => ({
		from: row.from,
		to: row.to,
		value: String(row.tokens),
		transactionHash: row.tx_hash,
		blockNumber: String(row.block_num),
		logIndex: Number(row.log_idx),
		timestamp: row.block_timestamp ? String(row.block_timestamp) : null,
	}))
}

async function fetchTotalCount(
	address: Address.Address,
	chainId: number,
	account?: Address.Address,
): Promise<{ count: number; capped: boolean }> {
	// Count is expensive - limit to first 100k rows using subquery pattern
	let subquery = QB.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select((eb) => eb.lit(1).as('x'))
		.where('chain', '=', chainId)
		.where('address', '=', address)

	if (account) {
		subquery = subquery.where((eb) =>
			eb.or([eb('from', '=', account), eb('to', '=', account)]),
		)
	}

	const result = await QB.selectFrom(subquery.limit(COUNT_CAP).as('subquery'))
		.select((eb) => eb.fn.count('x').as('count'))
		.executeTakeFirst()

	const count = Number(result?.count ?? 0)
	const capped = count >= COUNT_CAP

	return { count, capped }
}

const OG_THRESHOLDS = [100, 1_000, 10_000, 100_000] as const

const FetchOgStatsInputSchema = z.object({
	address: zAddress({ lowercase: true }),
})

export type OgStatsApiResponse = {
	holders: { count: number; isExact: boolean } | null
	created: string | null
}

const ogStatsCache = new Map<
	string,
	{
		data: OgStatsApiResponse
		timestamp: number
	}
>()

export const fetchOgStats = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchOgStatsInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			const config = getWagmiConfig()
			const chainId = getChainId(config)
			const cacheKey = `${chainId}-${data.address}`

			const cached = ogStatsCache.get(cacheKey)
			const now = Date.now()

			if (cached && now - cached.timestamp < OG_CACHE_TTL) {
				let result = cached.data

				// There might be holders data now so check that
				if (!result.holders) {
					const holders = await findHoldersThreshold(data.address, chainId)
					if (holders) {
						result = { ...result, holders }
						ogStatsCache.set(cacheKey, { data: result, timestamp: now })
					}
				}

				return result
			}

			const [holders, created] = await Promise.all([
				findHoldersThreshold(data.address, chainId),
				fetchFirstTransferData(data.address, chainId),
			])

			const result = { holders, created }
			ogStatsCache.set(cacheKey, { data: result, timestamp: now })

			return result
		} catch (error) {
			console.error('Failed to fetch OG stats:', error)
			return { holders: null, created: null }
		}
	})

async function findHoldersThreshold(
	address: Address.Address,
	chainId: number,
): Promise<{ count: number; isExact: boolean } | null> {
	const cacheKey = `${chainId}-${address}`
	const cached = holdersCache.get(cacheKey)
	const now = Date.now()

	if (cached && now - cached.timestamp < OG_CACHE_TTL) {
		const count = cached.data.allHolders.length

		if (count <= OG_THRESHOLDS[0]) {
			return { count, isExact: true }
		}

		let lastExceeded: number | null = null
		for (const threshold of OG_THRESHOLDS) {
			if (count > threshold) {
				lastExceeded = threshold
			} else {
				break
			}
		}
		return lastExceeded ? { count: lastExceeded, isExact: false } : null
	}

	// Skip expensive holder count query for OG images - it times out on high-volume tokens
	// (GROUP BY has to scan all rows before LIMIT can be applied)
	// The actual holder count will be fetched client-side where it can stream in
	return null
}

export { MAX_LIMIT, DEFAULT_LIMIT }
