import { createServerFn } from '@tanstack/react-start'
import type { Address, Hex } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { TOKEN_COUNT_MAX } from '#lib/constants'
import {
	fetchTokenFirstTransferTimestamp,
	fetchTokenHolderBalances,
	fetchTokenTransferCount,
	fetchTokenTransfers,
} from '#lib/server/tempo-queries'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config.ts'

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

export type HoldersCountResult = {
	count: number
	capped: boolean
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
				allHolders = await fetchTokenHolderBalances(data.address, chainId)

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

export async function fetchHoldersCountCached(
	address: Address.Address,
	chainId: number,
): Promise<HoldersCountResult> {
	const cacheKey = `${chainId}-${address}`
	const cached = holdersCache.get(cacheKey)
	const now = Date.now()

	let allHolders: Array<{ address: string; balance: bigint }>

	if (cached && now - cached.timestamp < CACHE_TTL) {
		allHolders = cached.data.allHolders
	} else {
		allHolders = await fetchTokenHolderBalances(address, chainId)
		holdersCache.set(cacheKey, {
			data: { allHolders },
			timestamp: now,
		})
	}

	const rawTotal = allHolders.length
	const capped = rawTotal >= COUNT_CAP
	const count = capped ? COUNT_CAP : rawTotal

	return { count, capped }
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

	const firstTransferTimestamp = await fetchTokenFirstTransferTimestamp(
		address,
		chainId,
	)

	let created: string | null = null
	if (firstTransferTimestamp) {
		const date = new Date(firstTransferTimestamp * 1000)
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
				fetchTokenTransfers(
					data.address,
					chainId,
					data.limit,
					data.offset,
					data.account,
				).catch((error) => {
					console.error('Failed to fetch transfers data:', error)
					return []
				}),
				fetchTokenTransferCount(
					data.address,
					chainId,
					COUNT_CAP,
					data.account,
				).catch((error) => {
					console.error('Failed to fetch transfers count:', error)
					return { count: 0, capped: false }
				}),
			])

			const nextOffset = data.offset + (transfers?.length ?? 0)

			return {
				transfers: transfers.map(mapTransferRow),
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

const mapTransferRow = (row: {
	from: Address.Address
	to: Address.Address
	tokens: bigint
	tx_hash: Hex.Hex
	block_num: bigint
	log_idx: number
	block_timestamp: string | number | null
}) => ({
	from: row.from,
	to: row.to,
	value: String(row.tokens),
	transactionHash: row.tx_hash,
	blockNumber: String(row.block_num),
	logIndex: Number(row.log_idx),
	timestamp: row.block_timestamp ? String(row.block_timestamp) : null,
})

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
