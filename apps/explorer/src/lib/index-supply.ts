import { env } from 'cloudflare:workers'
import { Address, Hex } from 'ox'
import { tempoTestnet } from 'tempo.ts/chains'
import * as z from 'zod/mini'

export const endpoint = 'https://api.tempo.xyz/indexer/query'
export const chainId = tempoTestnet.id
export const chainIdHex = Hex.fromNumber(chainId)
export const chainCursor = `${chainId}-0`

export const rowValueSchema = z.union([z.string(), z.number(), z.null()])

export const responseSchema = z.array(
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

export type RowValue = z.infer<typeof rowValueSchema>

export function toBigInt(value: RowValue | null | undefined): bigint {
	if (value === null || value === undefined) return 0n
	if (typeof value === 'number') return BigInt(value)
	const normalized = value.trim()
	if (normalized === '') return 0n
	return BigInt(normalized)
}

export function toQuantityHex(
	value: RowValue | null | undefined,
	fallback: bigint = 0n,
) {
	return Hex.fromNumber(
		value === null || value === undefined ? fallback : toBigInt(value),
	)
}

export function toHexData(value: RowValue | null | undefined): Hex.Hex {
	if (typeof value !== 'string' || value.length === 0) return '0x'
	Hex.assert(value)
	return value
}

export function toAddressValue(
	value: RowValue | null | undefined,
): Address.Address | null {
	if (typeof value !== 'string' || value.length === 0) return null
	Address.assert(value)
	return value
}

type RunQueryOptions = {
	signatures?: string[]
}

export async function runIndexSupplyQuery(
	query: string,
	options: RunQueryOptions = {},
) {
	const apiKey = env.INDEXSUPPLY_API_KEY
	if (!apiKey) throw new Error('INDEXSUPPLY_API_KEY is not configured')

	const url = new URL(endpoint)
	url.searchParams.set('api-key', apiKey)
	const signatures =
		options.signatures && options.signatures.length > 0
			? options.signatures
			: ['']

	const normalizedQuery = query.replace(/\s+/g, ' ').trim()
	const startTime = performance.now()
	if (env.LOG_LEVEL === 'info')
		console.log('[IndexSupply] Query started:', {
			query: normalizedQuery,
			signatures,
		})

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify([
			{
				cursor: chainCursor,
				signatures,
				query: normalizedQuery,
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

	const parsed = responseSchema.safeParse(json)
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

	const duration = performance.now() - startTime
	if (env.LOG_LEVEL === 'info')
		console.log('[IndexSupply] Query completed:', {
			duration: `${duration.toFixed(0)}ms`,
			rows: result.rows.length,
			query:
				normalizedQuery.slice(0, 80) +
				(normalizedQuery.length > 80 ? '...' : ''),
		})

	return result
}

type BatchQuery = {
	query: string
	signatures?: string[]
}

export async function runIndexSupplyBatch<T extends BatchQuery[]>(
	queries: T,
): Promise<{ [K in keyof T]: z.infer<typeof responseSchema>[number] }> {
	const apiKey = env.INDEXSUPPLY_API_KEY
	if (!apiKey) throw new Error('INDEXSUPPLY_API_KEY is not configured')

	const url = new URL(endpoint)
	url.searchParams.set('api-key', apiKey)

	const body = queries.map((q) => ({
		cursor: chainCursor,
		signatures: q.signatures && q.signatures.length > 0 ? q.signatures : [''],
		query: q.query.replace(/\s+/g, ' ').trim(),
	}))

	const startTime = performance.now()
	if (env.LOG_LEVEL === 'info')
		console.log('[IndexSupply] Batch started:', {
			count: queries.length,
			queries: body.map((b) => `${b.query.slice(0, 60)}...`),
		})

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
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

	const parsed = responseSchema.safeParse(json)
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

	if (parsed.data.length !== queries.length) {
		throw new Error(
			`IndexSupply returned ${parsed.data.length} results for ${queries.length} queries`,
		)
	}

	const duration = performance.now() - startTime
	if (env.LOG_LEVEL === 'info')
		console.log('[IndexSupply] Batch completed:', {
			duration: `${duration.toFixed(0)}ms`,
			results: parsed.data.map((r) => r.rows.length),
		})

	return parsed.data as {
		[K in keyof T]: z.infer<typeof responseSchema>[number]
	}
}
