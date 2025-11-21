import { createServerFn } from '@tanstack/react-start'
import type { Address, Hex } from 'ox'
import * as z from 'zod/mini'
import * as IS from '#lib/index-supply'
import { parsePgTimestamp } from '#lib/postgres'
import { zAddress } from '#lib/zod'

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]
const HOLDERS_CACHING = 60_000
const { chainId } = IS

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
		const cacheKey = `${chainId}-${data.address}`

		const cached = holdersCache.get(cacheKey)
		const now = Date.now()

		let allHolders: Array<{ address: string; balance: bigint }>
		let totalSupply: bigint

		if (cached && now - cached.timestamp < HOLDERS_CACHING) {
			allHolders = cached.data.allHolders
			totalSupply = cached.data.totalSupply
		} else {
			const result = await fetchHoldersData(data.address)
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

async function fetchHoldersData(address: Address.Address) {
	const result = await IS.runIndexSupplyQuery(
		/* sql */ `
			SELECT "from", "to", tokens
			FROM transfer
			WHERE chain = ${chainId}
				AND address = '${address}'
		`,
		{
			signatures: [
				'Transfer(address indexed from, address indexed to, uint tokens)',
			],
		},
	)

	const balances = new Map<string, bigint>()

	for (const row of result.rows) {
		const [fromRaw, toRaw, tokensRaw] = row
		if (tokensRaw === null) continue
		const from = String(fromRaw)
		const to = String(toRaw)
		const value = BigInt(tokensRaw)

		if (from !== '0x0000000000000000000000000000000000000000') {
			const fromBalance = balances.get(from) ?? 0n
			balances.set(from, fromBalance - value)
		}

		const toBalance = balances.get(to) ?? 0n
		balances.set(to, toBalance + value)
	}

	const allHolders = Array.from(balances.entries())
		.filter(([_, balance]) => balance > 0n)
		.map(([address, balance]) => ({ address, balance }))
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
		const [transfers, total] = await Promise.all([
			fetchTransfersData(data.address, data.limit, data.offset),
			fetchTotalCount(data.address),
		])

		const nextOffset = data.offset + transfers.length

		return {
			transfers,
			total,
			offset: nextOffset,
			limit: transfers.length,
		}
	})

async function fetchTransfersData(
	address: Address.Address,
	limit: number,
	offset: number,
) {
	const result = await IS.runIndexSupplyQuery(
		/* sql */ `
			SELECT "from", "to", tokens, tx_hash, block_num, log_idx, block_timestamp
			FROM transfer
			WHERE chain = ${chainId}
				AND address = '${address}'
			ORDER BY block_num DESC, log_idx DESC
			LIMIT ${limit}
			OFFSET ${offset}
		`,
		{
			signatures: [
				'Transfer(address indexed from, address indexed to, uint tokens)',
			],
		},
	)

	return result.rows.map((row) => {
		const [from, to, value, transactionHash, blockNumber, logIndex, timestamp] =
			row
		return {
			from: from as Address.Address,
			to: to as Address.Address,
			value: String(value),
			transactionHash: transactionHash as Hex.Hex,
			blockNumber: String(blockNumber),
			logIndex: Number(logIndex),
			timestamp: timestamp ? String(parsePgTimestamp(String(timestamp))) : null,
		}
	})
}

async function fetchTotalCount(address: Address.Address) {
	const result = await IS.runIndexSupplyQuery(
		/* sql */ `
			SELECT COUNT(tx_hash)
			FROM transfer
			WHERE chain = ${chainId}
				AND address = '${address}'
		`,
		{
			signatures: [
				'Transfer(address indexed from, address indexed to, uint tokens)',
			],
		},
	)

	return Number(result.rows[0]?.[0] ?? 0)
}

export { MAX_LIMIT, DEFAULT_LIMIT }
