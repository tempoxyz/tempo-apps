import { createServerFn } from '@tanstack/react-start'
import { Address, Hex } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { parsePgTimestamp } from '#lib/postgres'
import { config } from '#wagmi.config'

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]

const FetchTokenTransfersInputSchema = z.object({
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

const rowValueSchema = z.union([z.string(), z.number(), z.null()])

const TransfersSchema = z.array(
	z.object({
		cursor: z.string(),
		columns: z.array(z.object({ name: z.string(), pgtype: z.string() })),
		rows: z.array(z.array(rowValueSchema)),
	}),
)

const TotalCountSchema = z.array(
	z.object({
		cursor: z.string(),
		columns: z.array(z.object({ name: z.string(), pgtype: z.string() })),
		rows: z.array(z.array(rowValueSchema)),
	}),
)

export const fetchTokenTransfers = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenTransfersInputSchema.parse(input))
	.handler(async ({ data }) => {
		const apiKey = process.env.INDEXSUPPLY_API_KEY
		if (!apiKey) throw new Error('INDEXSUPPLY_API_KEY is not configured')

		const chainId = getChainId(config)

		const [transfers, total] = await Promise.all([
			fetchTransfers(chainId, data.address, data.limit, data.offset, apiKey),
			fetchTotalCount(chainId, data.address, apiKey),
		])

		const nextOffset = data.offset + transfers.length

		return {
			transfers,
			total,
			offset: nextOffset,
			limit: transfers.length,
		}
	})

async function fetchTransfers(
	chainId: number,
	address: Address.Address,
	limit: number,
	offset: number,
	apiKey: string,
) {
	const searchParams = new URLSearchParams({
		query: `SELECT "from", "to", tokens, tx_hash, block_num, log_idx, block_timestamp FROM transfer WHERE chain = ${chainId} AND address = '${address}' ORDER BY block_num DESC, log_idx DESC LIMIT ${limit} OFFSET ${offset}`,
		signatures:
			'Transfer(address indexed from, address indexed to, uint tokens)',
		'api-key': apiKey,
	})

	const response = await fetch(
		`https://api.indexsupply.net/v2/query?${searchParams}`,
	)
	if (!response.ok) throw new Error(await response.text())

	const parsed = TransfersSchema.safeParse(await response.json())
	if (!parsed.success) throw new Error(z.prettifyError(parsed.error))

	const [result] = parsed.data
	if (!result) throw new Error('IndexSupply returned an empty result set')

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

async function fetchTotalCount(
	chainId: number,
	address: Address.Address,
	apiKey: string,
) {
	const params = new URLSearchParams({
		query: `SELECT COUNT(tx_hash) FROM transfer WHERE chain = ${chainId} AND address = '${address}'`,
		signatures:
			'Transfer(address indexed from, address indexed to, uint tokens)',
		'api-key': apiKey,
	})

	const response = await fetch(`https://api.indexsupply.net/v2/query?${params}`)
	if (!response.ok) throw new Error(await response.text())

	const parsed = TotalCountSchema.safeParse(await response.json())
	if (!parsed.success) throw new Error(z.prettifyError(parsed.error))

	const [result] = parsed.data
	if (!result) throw new Error('IndexSupply returned an empty result set')

	return Number(result.rows[0]?.[0] ?? 0)
}

export { MAX_LIMIT, DEFAULT_LIMIT }
