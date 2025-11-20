import { createServerFn } from '@tanstack/react-start'
import { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { config } from '#wagmi.config'

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

const FetchTokenHoldersInputSchema = z.object({
	address: z.pipe(
		z.string(),
		z.transform((value) => {
			const normalized = value.toLowerCase() as Address.Address
			Address.assert(normalized)
			return normalized
		}),
	),
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

const rowValueSchema = z.union([z.string(), z.number(), z.null()])

const TransfersSchema = z.array(
	z.object({
		cursor: z.string(),
		columns: z.array(z.object({ name: z.string(), pgtype: z.string() })),
		rows: z.array(z.array(rowValueSchema)),
	}),
)

export const fetchTokenHolders = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenHoldersInputSchema.parse(input))
	.handler(async ({ data }) => {
		const apiKey = process.env.INDEXSUPPLY_API_KEY
		if (!apiKey) throw new Error('INDEXSUPPLY_API_KEY is not configured')

		const chainId = getChainId(config)
		const cacheKey = `${chainId}-${data.address}`

		const cached = holdersCache.get(cacheKey)
		const now = Date.now()

		let allHolders: Array<{ address: string; balance: bigint }>
		let totalSupply: bigint

		if (cached && now - cached.timestamp < HOLDERS_CACHING) {
			allHolders = cached.data.allHolders
			totalSupply = cached.data.totalSupply
		} else {
			const result = await fetchHolders(chainId, data.address, apiKey)
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

async function fetchHolders(
	chainId: number,
	address: Address.Address,
	apiKey: string,
) {
	const params = new URLSearchParams({
		query: `SELECT "from", "to", tokens FROM transfer WHERE chain = ${chainId} AND address = '${address}'`,
		signatures:
			'Transfer(address indexed from, address indexed to, uint tokens)',
		'api-key': apiKey,
	})

	const response = await fetch(`https://api.indexsupply.net/v2/query?${params}`)
	if (!response.ok) throw new Error(await response.text())

	const parsed = TransfersSchema.safeParse(await response.json())
	if (!parsed.success) throw new Error(z.prettifyError(parsed.error))

	const [result] = parsed.data
	if (!result) throw new Error('IndexSupply returned an empty result set')

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

export { MAX_LIMIT, DEFAULT_LIMIT }
