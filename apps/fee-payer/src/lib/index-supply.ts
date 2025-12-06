import { env } from 'cloudflare:workers'
import { tempo } from 'tempo.ts/chains'
import * as z from 'zod/mini'

const endpoint = 'https://api.tempo.xyz/indexer/query'
const chainId = tempo.id
const chainCursor = `${chainId}-0`

const rowValueSchema = z.union([z.string(), z.number(), z.null()])

const responseSchema = z.array(
	z.object({
		cursor: z.optional(z.string()),
		columns: z.array(z.object({ name: z.string(), pgtype: z.string() })),
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

type QueryOptions = {
	signatures?: string[]
}

export async function runQuery(query: string, options: QueryOptions = {}) {
	const apiKey = env.INDEXSUPPLY_API_KEY
	if (!apiKey) throw new Error('INDEXSUPPLY_API_KEY is not configured')

	const url = new URL(endpoint)
	url.searchParams.set('api-key', apiKey)

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify([
			{
				cursor: chainCursor,
				signatures: options.signatures?.length ? options.signatures : [''],
				query: query.replace(/\s+/g, ' ').trim(),
			},
		]),
	})

	const json = await response.json().catch(() => {
		throw new Error('IndexSupply API returned invalid JSON')
	})

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
	return result
}
