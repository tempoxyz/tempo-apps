import type { Address } from 'viem'
import { parseUnits } from 'viem'
import { Addresses } from 'viem/tempo'
import * as z from 'zod/mini'
import { zAddress } from '#lib/zod'

export const dexRouteSearchSchema = z.object({
	from: z._default(
		zAddress({ lowercase: true }),
		'0x20c00000000000000000000014f22ca97301eb73',
	),
	to: z._default(zAddress({ lowercase: true }), Addresses.pathUsd),
	amount: z._default(
		z.string().check(z.regex(/^\d{1,33}(\.\d{1,18})?$/)),
		'10000',
	),
})

export type DexRouteSearch = z.infer<typeof dexRouteSearchSchema>

/** Reject precision loss rather than letting parseUnits round a user's input. */
export function parseRouteAmount(amount: string, decimals: number): bigint {
	if (!/^\d{1,33}(\.\d{1,18})?$/.test(amount))
		throw new Error('Enter a positive decimal amount.')
	if ((amount.split('.')[1]?.length ?? 0) > decimals)
		throw new Error(`Use at most ${decimals} decimal places.`)
	const value = parseUnits(amount, decimals)
	if (value <= 0n || value >= 2n ** 128n)
		throw new Error(
			'Enter an amount greater than zero and within the DEX limit.',
		)
	return value
}

/** Mirrors the DEX's direct-pair fast path and lowest-common-ancestor routing. */
export async function resolveDexPath(
	from: Address,
	to: Address,
	quoteToken: (token: Address) => Promise<Address | undefined>,
): Promise<Address[]> {
	const equal = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase()
	if (equal(from, to)) throw new Error('Choose two different tokens.')
	const [fromQuote, toQuote] = await Promise.all([
		quoteToken(from),
		quoteToken(to),
	])
	if ((fromQuote && equal(fromQuote, to)) || (toQuote && equal(toQuote, from)))
		return [from, to]
	async function ancestors(start: Address): Promise<Address[]> {
		const path = [start]
		while (!equal(path[path.length - 1], Addresses.pathUsd)) {
			const next = await quoteToken(path[path.length - 1])
			if (!next || path.some((token) => equal(token, next)))
				throw new Error(
					'The quote-token path is incomplete or contains a cycle.',
				)
			if (path.length >= 16)
				throw new Error('This quote-token path is too long to display.')
			path.push(next)
		}
		return path
	}
	const [left, right] = await Promise.all([ancestors(from), ancestors(to)])
	const common = left.findIndex((token) =>
		right.some((other) => equal(token, other)),
	)
	if (common < 0)
		throw new Error('These tokens have no shared quote-token path.')
	const rightCommon = right.findIndex((token) => equal(token, left[common]))
	return [
		...left.slice(0, common + 1),
		...right.slice(0, rightCommon).reverse(),
	]
}

export type DexToken = {
	address: Address
	symbol: string
	decimals: number
	quoteToken?: Address | undefined
}

export type DexQuote = {
	amountIn: string
	amountOut: string | null
	status: 'quoted' | 'no-liquidity' | 'unavailable'
}

/** Positive means worse execution than the small-trade reference rate. */
export function quoteImpact(
	quote: DexQuote,
	reference: DexQuote,
): number | null {
	if (!quote.amountOut || !reference.amountOut) return null
	const rate = Number(quote.amountOut) / Number(quote.amountIn)
	const referenceRate = Number(reference.amountOut) / Number(reference.amountIn)
	return referenceRate > 0 ? (1 - rate / referenceRate) * 10_000 : null
}
