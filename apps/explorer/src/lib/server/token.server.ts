import { createServerFn } from '@tanstack/react-start'
import * as IDX from 'idxs'
import type { Address, Hex } from 'ox'
import { zeroAddress } from 'viem'
import * as z from 'zod/mini'
import { zAddress } from '#lib/zod'
import { config } from '#wagmi.config.ts'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]
const HOLDERS_CACHING = 60_000

const holdersCache = new Map<
	string,
	{
		data: {
			allHolders: Array<{ address: string; balance: bigint }>
			totalSupply: bigint
		}
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
		percentage: number
	}>
	total: number
	totalSupply: string
	offset: number
	limit: number
}

export const fetchHolders = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenHoldersInputSchema.parse(input))
	.handler(async ({ data }) => {
		const chainId = config.getClient().chain.id
		const cacheKey = `${chainId}-${data.address}`

		const cached = holdersCache.get(cacheKey)
		const now = Date.now()

		let allHolders: Array<{ address: string; balance: bigint }>
		let totalSupply: bigint

		if (cached && now - cached.timestamp < HOLDERS_CACHING) {
			allHolders = cached.data.allHolders
			totalSupply = cached.data.totalSupply
		} else {
			const result = await fetchHoldersData(data.address, chainId)
			allHolders = result.allHolders
			totalSupply = result.totalSupply

			holdersCache.set(cacheKey, {
				data: { allHolders, totalSupply },
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
			percentage:
				totalSupply > 0n
					? Number((holder.balance * 10000n) / totalSupply) / 100
					: 0,
		}))

		const total = allHolders.length
		const nextOffset = data.offset + holders.length

		return {
			holders,
			total,
			totalSupply: totalSupply.toString(),
			offset: nextOffset,
			limit: holders.length,
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

	const allHolders = Array.from(balances.entries())
		.filter(([, balance]) => balance > 0n)
		.map(([holder, balance]) => ({ address: holder, balance }))
		.sort((a, b) => (b.balance > a.balance ? 1 : -1))

	const totalSupply = allHolders.reduce(
		(sum, holder) => sum + holder.balance,
		0n,
	)

	return { allHolders, totalSupply }
}

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
	offset: number
	limit: number
}

export const fetchTransfers = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenTransfersInputSchema.parse(input))
	.handler(async ({ data }) => {
		const chainId = config.getClient().chain.id
		const [transfers, total] = await Promise.all([
			fetchTransfersData(
				data.address,
				data.limit,
				data.offset,
				chainId,
				data.account,
			),
			fetchTotalCount(data.address, chainId, data.account),
		])

		const nextOffset = data.offset + (transfers?.length ?? 0)

		return {
			transfers,
			total,
			offset: nextOffset,
			limit: transfers?.length,
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
) {
	let query = QB.withSignatures([TRANSFER_SIGNATURE])
		.selectFrom('transfer')
		.select((eb) => eb.fn.count('tx_hash').as('count'))
		.where('chain', '=', chainId)
		.where('address', '=', address)

	if (account) {
		query = query.where((eb) =>
			eb.or([eb('from', '=', account), eb('to', '=', account)]),
		)
	}

	const result = await query.executeTakeFirstOrThrow()

	return Number(result.count)
}

export { MAX_LIMIT, DEFAULT_LIMIT }
