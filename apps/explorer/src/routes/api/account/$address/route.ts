import { createFileRoute } from '@tanstack/react-router'
import { Address, Hex } from 'ox'
import { tempoAndantino } from 'tempo.ts/chains'
import type { RpcTransaction } from 'viem'
import * as z from 'zod/mini'

const [MAX_LIMIT, DEFAULT_LIMIT] = [1_000, 100]
const INDEX_SUPPLY_ENDPOINT = 'https://api.indexsupply.net/v2/query'
const chainId = tempoAndantino.id
const chainIdHex = Hex.fromNumber(chainId)
const chainCursor = `${chainId}-0`

const rowValueSchema = z.union([z.string(), z.number(), z.null()])

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

type RowValue = z.infer<typeof rowValueSchema>

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

type RunQueryOptions = {
	signatures?: string[]
}

async function runIndexSupplyQuery(
	query: string,
	options: RunQueryOptions = {},
) {
	const apiKey = process.env.INDEXSUPPLY_API_KEY
	if (!apiKey) throw new Error('INDEXSUPPLY_API_KEY is not configured')

	const url = new URL(INDEX_SUPPLY_ENDPOINT)
	url.searchParams.set('api-key', apiKey)
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
	} catch {
		throw new Error('IndexSupply API returned invalid JSON')
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

export const Route = createFileRoute('/api/account/$address')({
	beforeLoad: async ({ search, params }) => {
		const { address } = params
		const { offset, limit, include, sort } = search

		if (limit > MAX_LIMIT) throw new Error('Limit is too high')

		return { address, offset, limit, include, sort }
	},
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const { address } = params
				const url = new URL(request.url)
				const normalizedAddress = address.toLowerCase() as Address.Address
				const rawOffset = Number(url.searchParams.get('offset') ?? 0)
				const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
				const includeParam = (
					url.searchParams.get('include') ?? 'all'
				).toLowerCase()
				const include: 'sent' | 'received' | 'all' =
					includeParam === 'sent'
						? 'sent'
						: includeParam === 'received'
							? 'received'
							: 'all'
				const sortParam = (url.searchParams.get('sort') ?? 'desc').toLowerCase()
				const sort: 'asc' | 'desc' = sortParam === 'asc' ? 'asc' : 'desc'
				const sortDirection = sort === 'asc' ? 'ASC' : 'DESC'

				const offset = Math.max(
					0,
					Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0,
				)

				let limit = Number.isFinite(rawLimit)
					? Math.floor(rawLimit)
					: DEFAULT_LIMIT

				if (limit > MAX_LIMIT)
					return Response.json({ error: 'Limit is too high' }, { status: 400 })

				if (limit < 1) limit = 1

				const transferSignature =
					'Transfer(address indexed from, address indexed to, uint tokens)'
				const includeSent = include === 'all' || include === 'sent'
				const includeReceived = include === 'all' || include === 'received'

				const directConditions: string[] = []
				if (includeSent)
					directConditions.push(`t."from" = '${normalizedAddress}'`)
				if (includeReceived)
					directConditions.push(`t."to" = '${normalizedAddress}'`)

				const transferConditions: string[] = []
				if (includeSent)
					transferConditions.push(`tr."from" = '${normalizedAddress}'`)
				if (includeReceived)
					transferConditions.push(`tr."to" = '${normalizedAddress}'`)

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

				try {
					// Parallelize count and transactions fetch
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
								ORDER BY t.block_num ${sortDirection}, t.hash ${sortDirection}
								LIMIT ${limit}
								OFFSET ${offset}
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
							throw new Error(
								`Missing "${name}" column in IndexSupply response`,
							)
						return row[columnIndex] ?? null
					}

					const transactions: RpcTransaction[] = txsResult.rows.map((row) => {
						const hash = toHexData(getColumnValue(row, 'hash'))
						const from = toAddressValue(getColumnValue(row, 'from'))
						if (!from)
							throw new Error('Transaction is missing a "from" address')

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

					const nextOffset = offset + transactions.length
					const hasMore = nextOffset < total

					const cacheControl =
						offset === 0
							? 'public, max-age=0, must-revalidate' // No cache for first page
							: 'public, max-age=3600, stale-while-revalidate=86400' // 1hr cache for others

					return Response.json(
						{
							transactions,
							total,
							offset: nextOffset,
							limit: transactions.length,
							hasMore,
							error: null,
						},
						{
							headers: {
								'Content-Type': 'application/json',
								'Cache-Control': cacheControl,
							},
						},
					)
				} catch (error) {
					console.error('API Error:', error)
					return Response.json(
						{ error: 'Failed to fetch transactions' },
						{ status: 500 },
					)
				}
			},
		},
	},
	params: z.object({
		address: z.pipe(
			z.string(),
			z.transform((x) => {
				Address.assert(x)
				return x
			}),
		),
	}),
	validateSearch: z.object({
		offset: z.prefault(z.coerce.number(), 0),
		limit: z.prefault(z.coerce.number(), 100),
		include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
		sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	}),
})
