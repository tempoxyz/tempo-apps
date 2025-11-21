import { env } from 'cloudflare:workers'
import { Address, Hex } from 'ox'
import { tempoAndantino } from 'tempo.ts/chains'
import * as z from 'zod/mini'

export const endpoint = 'https://api.indexsupply.net/v2/query'
export const chainId = tempoAndantino.id
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
