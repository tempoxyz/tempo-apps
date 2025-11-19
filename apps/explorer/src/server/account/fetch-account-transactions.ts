import { createServerFn } from '@tanstack/react-start'
import { Address, Hex } from 'ox'
import { tempoAndantino } from 'tempo.ts/chains'
import type { RpcTransaction } from 'viem'
import * as z from 'zod/mini'
import { env } from '#lib/env.ts'

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]

const chainId = tempoAndantino.id
const chainIdHex = Hex.fromNumber(chainId)
const chainCursor = `${chainId}-0`

const rowValueSchema = z.union([z.string(), z.number(), z.null()])
export type RowValue = z.infer<typeof rowValueSchema>

export const SearchParamsSchema = z.object({
	offset: z.prefault(z.coerce.number().check(z.gte(0)), 0),
	limit: z.prefault(
		z.coerce.number().check(z.gte(1), z.lte(MAX_LIMIT)),
		DEFAULT_LIMIT,
	),
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
})

const FetchAccountTransactionsInputSchema = z.object({
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
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
	sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
})

export type FetchAccountTransactionsInput = z.infer<
	typeof FetchAccountTransactionsInputSchema
>

export type TransactionsApiResponse = {
	transactions: Array<RpcTransaction>
	total: number
	offset: number
	limit: number
	hasMore: boolean
	error: null
}

type RunQueryOptions = {
	signatures?: string[]
}

export const fetchAccountTransactions = createServerFn({ method: 'POST' })
	.inputValidator(FetchAccountTransactionsInputSchema)
	.handler(async ({ data }) => {

		const include = data.include ?? 'all'
		const sort = (data.sort ?? 'desc') === 'asc' ? 'ASC' : 'DESC'

		const transferSignature =
			'Transfer(address indexed from, address indexed to, uint tokens)'
		const includeSent = include === 'all' || include === 'sent'
		const includeReceived = include === 'all' || include === 'received'

		const directConditions: string[] = []
		if (includeSent) directConditions.push(`t."from" = '${data.address}'`)
		if (includeReceived) directConditions.push(`t."to" = '${data.address}'`)

		const transferConditions: string[] = []
		if (includeSent) transferConditions.push(`tr."from" = '${data.address}'`)
		if (includeReceived) transferConditions.push(`tr."to" = '${data.address}'`)

		const addressFilterParts: string[] = []
		if (directConditions.length)
			addressFilterParts.push(`(${directConditions.join(' OR ')})`)

		if (transferConditions.length) {
			addressFilterParts.push(`
				t.hash IN (
					SELECT DISTINCT tr.tx_hash
					FROM transfer tr
					WHERE tr.chain = ${chainId}
						AND (${transferConditions.join(' OR ')})
				)
			`)
		}

		if (addressFilterParts.length === 0) addressFilterParts.push('FALSE')
		const addressFilter = addressFilterParts.join(' OR ')

		const [countResult, txsResult] = await Promise.all([
			runIndexSupplyQuery(
				/* sql */ `
					SELECT count(t.hash) as total
					FROM txs t
					WHERE t.chain = ${chainId}
						AND (${addressFilter})
				`,
				{ signatures: [transferSignature] },
			),
			runIndexSupplyQuery(
				/* sql */ `
					SELECT
						t.hash,
						t.block_num,
						t."from",
						t."to",
						t.value,
						t.input,
						t.nonce,
						t.gas,
						t.gas_price,
						t.type
					FROM txs t
					WHERE t.chain = ${chainId}
						AND (${addressFilter})
					ORDER BY t.block_num ${sort}, t.hash ${sort}
					LIMIT ${data.limit}
					OFFSET ${data.offset}
				`,
				{ signatures: [transferSignature] },
			),
		])

		const totalValue = countResult.rows.at(0)?.at(0)
		const total =
			typeof totalValue === 'number'
				? totalValue
				: typeof totalValue === 'string'
					? Number(totalValue)
					: 0

		const txColumns = new Map(
			txsResult.columns.map((column, index) => [column.name, index]),
		)
		const getColumnValue = (row: RowValue[], name: string) => {
			const columnIndex = txColumns.get(name)
			if (columnIndex === undefined)
				throw new Error(`Missing "${name}" column in IndexSupply response`)
			return row[columnIndex] ?? null
		}

		const transactions: RpcTransaction[] = txsResult.rows.map((row) => {
			const hash = toHexData(getColumnValue(row, 'hash'))
			const from = toAddressValue(getColumnValue(row, 'from'))
			if (!from) throw new Error('Transaction is missing a "from" address')

			const to = toAddressValue(getColumnValue(row, 'to'))

			return {
				blockHash: null,
				blockNumber: toQuantityHex(getColumnValue(row, 'block_num')),
				chainId: chainIdHex,
				from,
				gas: toQuantityHex(getColumnValue(row, 'gas')),
				gasPrice: toQuantityHex(getColumnValue(row, 'gas_price')),
				hash,
				input: toHexData(getColumnValue(row, 'input')),
				nonce: toQuantityHex(getColumnValue(row, 'nonce')),
				to,
				transactionIndex: null,
				value: toQuantityHex(getColumnValue(row, 'value')),
				type: toQuantityHex(
					getColumnValue(row, 'type'),
				) as RpcTransaction['type'],
				v: '0x0',
				r: '0x0',
				s: '0x0',
			} as RpcTransaction
		})

		const nextOffset = data.offset + transactions.length
		const hasMore = nextOffset < total

		return {
			transactions,
			total,
			offset: nextOffset,
			limit: transactions.length,
			hasMore,
			error: null,
		}
	})

async function runIndexSupplyQuery(
	query: string,
	options: RunQueryOptions = {},
) {
	const url = new URL(env.server.INDEXSUPPLY_ENDPOINT)
	url.searchParams.set('api-key', env.server.INDEXSUPPLY_API_KEY)
	const signatures =
		options.signatures && options.signatures.length > 0
			? options.signatures
			: ['']

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify([
			{
				cursor: chainCursor,
				signatures,
				query: query.replace(/\s+/g, ' ').trim(),
			},
		]),
	})

	let json: unknown
	try {
		json = await response.json()
	} catch (error) {
		console.error('IndexSupply API returned invalid JSON', error)
		throw new Error('IndexSupply API returned invalid JSON', { cause: error })
	}

	if (!response.ok) {
		const message =
			typeof json === 'object' &&
			json !== null &&
			'message' in json &&
			typeof (json as { message?: string }).message === 'string'
				? (json as { message: string }).message
				: response.statusText
		throw new Error(`IndexSupply API error (${response.status}): ${message}`)
	}

	const indexSupplyResponseSchema = z.array(
		z.object({
			cursor: z.optional(z.string()),
			columns: z.array(
				z.object({
					name: z.string(),
					pgtype: z.string(),
				}),
			),
			rows: z.array(z.array(rowValueSchema)),
		}),
	)

	const parsed = indexSupplyResponseSchema.safeParse(json)
	if (!parsed.success) {
		const message =
			typeof json === 'object' &&
			json !== null &&
			'message' in json &&
			typeof (json as { message?: string }).message === 'string'
				? (json as { message: string }).message
				: z.prettifyError(parsed.error)
		throw new Error(`IndexSupply response shape is unexpected: ${message}`)
	}

	const [result] = parsed.data
	if (!result) throw new Error('IndexSupply returned an empty result set')
	return result
}

const toBigInt = (value: RowValue | null | undefined): bigint => {
	if (value === null || value === undefined) return 0n
	if (typeof value === 'number') return BigInt(value)
	const normalized = value.trim()
	if (normalized === '') return 0n
	return BigInt(normalized)
}

const toQuantityHex = (
	value: RowValue | null | undefined,
	fallback: bigint = 0n,
) =>
	Hex.fromNumber(
		value === null || value === undefined ? fallback : toBigInt(value),
	)

const toHexData = (value: RowValue | null | undefined): Hex.Hex => {
	if (typeof value !== 'string' || value.length === 0) return '0x'
	Hex.assert(value)
	return value
}

const toAddressValue = (
	value: RowValue | null | undefined,
): Address.Address | null => {
	if (typeof value !== 'string' || value.length === 0) return null
	Address.assert(value)
	return value
}

export { MAX_LIMIT, DEFAULT_LIMIT }
