import { createServerFn } from '@tanstack/react-start'
import {
	BaseError,
	ContractFunctionRevertedError,
	formatUnits,
	type Address,
} from 'viem'
import { Addresses } from 'viem/tempo'
import * as z from 'zod/mini'
import { Abis } from '#lib/abis'
import {
	depthTicks,
	dexRouteInputSchema,
	parseRouteAmount,
	resolveDexPath,
	type DexQuote,
	type DexRouteInput,
	type DexToken,
} from '#lib/dex-route'
import { zAddress } from '#lib/zod'
import { getBatchedClient } from '#wagmi.config'

export type DexLeg = {
	from: DexToken
	to: DexToken
	base: DexToken
	quote: DexToken
	/** Selling base fills resting bids; buying base fills resting asks. */
	isBid: boolean
	exists: boolean
	/** Best tick on the side this leg fills, or null when that side is empty. */
	bestTick: number | null
	/** Best bid and ask in quote per base. */
	bid: number | null
	ask: number | null
	bestRate: number | null
}

export type DexDepthLevel = {
	tick: number
	rate: number
	/** Input-token amount this tick can absorb. */
	amountIn: string
	cumulativeIn: string
}

export type DexRouteSnapshot = {
	blockNumber: string
	path: DexToken[]
	legs: DexLeg[]
	quote: DexQuote
	reference: DexQuote
	inputError: string | null
}

function reverted(error: unknown): ContractFunctionRevertedError | undefined {
	if (!(error instanceof BaseError)) return undefined
	const cause = error.walk(
		(cause) => cause instanceof ContractFunctionRevertedError,
	)
	return cause instanceof ContractFunctionRevertedError ? cause : undefined
}

export async function getDexRoute(
	input: DexRouteInput,
): Promise<DexRouteSnapshot> {
	const client = getBatchedClient()
	const blockNumber = await client.getBlockNumber()
	const cache = new Map<string, Promise<DexToken>>()
	function metadata(address: Address) {
		const key = address.toLowerCase()
		let value = cache.get(key)
		if (!value) {
			value = client.token
				.getMetadata({ token: address, blockNumber })
				.then((token) => ({
					address,
					symbol: token.symbol,
					decimals: token.decimals,
					quoteToken: token.quoteToken,
				}))
			cache.set(key, value)
		}
		return value
	}
	const addresses = await resolveDexPath(
		input.from,
		input.to,
		async (address) => (await metadata(address)).quoteToken,
	)
	const path = await Promise.all(addresses.map(metadata))
	const dex = {
		address: Addresses.stablecoinDex,
		abi: Abis.stablecoinDex,
		blockNumber,
	} as const
	const [minTick, maxTick] = await Promise.all([
		client.readContract({ ...dex, functionName: 'MIN_TICK' }),
		client.readContract({ ...dex, functionName: 'MAX_TICK' }),
	])
	const legs = await Promise.all(
		path.slice(0, -1).map(async (from, index): Promise<DexLeg> => {
			const to = path[index + 1]
			const sellBase =
				from.quoteToken?.toLowerCase() === to.address.toLowerCase()
			const bookKey = await client.readContract({
				...dex,
				functionName: 'pairKey',
				args: sellBase
					? [from.address, to.address]
					: [to.address, from.address],
			})
			const book = await client.readContract({
				...dex,
				functionName: 'books',
				args: [bookKey],
			})
			const exists = !/^0x0{40}$/i.test(book.base)
			const valid = (tick: number) =>
				exists && tick >= minTick && tick <= maxTick
			const bid = valid(book.bestBidTick) ? tickPrice(book.bestBidTick) : null
			const ask = valid(book.bestAskTick) ? tickPrice(book.bestAskTick) : null
			const bestTick = sellBase ? book.bestBidTick : book.bestAskTick
			const best = sellBase ? bid : ask
			return {
				from,
				to,
				base: sellBase ? from : to,
				quote: sellBase ? to : from,
				isBid: sellBase,
				exists,
				bestTick: best === null ? null : bestTick,
				bid,
				ask,
				bestRate: best === null ? null : sellBase ? best : 1 / best,
			}
		}),
	)
	async function quote(amount: string): Promise<DexQuote> {
		try {
			const amountIn = parseRouteAmount(amount, path[0].decimals)
			const amountOut = await client.readContract({
				...dex,
				functionName: 'quoteSwapExactAmountIn',
				args: [input.from, input.to, amountIn],
			})
			return {
				amountIn: amount,
				amountOut: formatUnits(amountOut, path[path.length - 1].decimals),
				status: 'quoted',
			}
		} catch (error) {
			const cause = reverted(error)
			return {
				amountIn: amount,
				amountOut: null,
				status:
					cause?.data?.errorName === 'InsufficientLiquidity'
						? 'no-liquidity'
						: 'unavailable',
			}
		}
	}
	let inputError: string | null = null
	try {
		parseRouteAmount(input.amount, path[0].decimals)
	} catch (error) {
		inputError = error instanceof Error ? error.message : 'Invalid amount.'
	}
	const [selected, reference] = await Promise.all([
		inputError
			? Promise.resolve<DexQuote>({
					amountIn: input.amount,
					amountOut: null,
					status: 'unavailable',
				})
			: quote(input.amount),
		quote('1'),
	])
	return {
		blockNumber: String(blockNumber),
		path,
		legs,
		quote: selected,
		reference,
		inputError,
	}
}

export const fetchDexRoute = createServerFn({ method: 'POST' })
	.inputValidator((input) => dexRouteInputSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			return await withDeadline(getDexRoute(data))
		} catch {
			throw new Error(
				'The Stablecoin DEX route is temporarily unavailable. Check the token addresses or try again.',
			)
		}
	})

const depthInputSchema = z.object({
	from: zAddress({ lowercase: true }),
	to: zAddress({ lowercase: true }),
	tick: z.number().check(z.int(), z.gte(-32_768), z.lte(32_767)),
	blockNumber: z.string().check(z.regex(/^\d{1,20}$/)),
})

export type DexDepthInput = z.infer<typeof depthInputSchema>

/** Walks the side a leg fills, from its best tick, at the route's snapshot block. */
export async function getDexLegDepth(
	input: DexDepthInput,
): Promise<DexDepthLevel[]> {
	const client = getBatchedClient()
	const blockNumber = BigInt(input.blockNumber)
	const dex = {
		address: Addresses.stablecoinDex,
		abi: Abis.stablecoinDex,
		blockNumber,
	} as const
	const [from, to, minTick, maxTick, spacing] = await Promise.all([
		client.token.getMetadata({ token: input.from, blockNumber }),
		client.token.getMetadata({ token: input.to, blockNumber }),
		client.readContract({ ...dex, functionName: 'MIN_TICK' }),
		client.readContract({ ...dex, functionName: 'MAX_TICK' }),
		client.readContract({ ...dex, functionName: 'TICK_SPACING' }),
	])
	const isBid = from.quoteToken?.toLowerCase() === input.to
	const base = isBid ? input.from : input.to
	const ticks = Array.from(
		{ length: depthTicks },
		(_, index) => input.tick + (isBid ? -index : index) * spacing,
	).filter((tick) => tick >= minTick && tick <= maxTick)
	const levels = await Promise.all(
		ticks.map((tick) =>
			client.readContract({
				...dex,
				functionName: 'getTickLevel',
				args: [base, tick, isBid],
			}),
		),
	)
	let cumulative = 0n
	return ticks.flatMap((tick, index) => {
		// Liquidity is base-denominated; express it in the leg's input token.
		const liquidity = levels[index][2]
		if (!liquidity) return []
		const amountIn = isBid
			? liquidity
			: rescale(
					(liquidity * BigInt(100_000 + tick)) / 100_000n,
					to.decimals,
					from.decimals,
				)
		cumulative += amountIn
		const price = tickPrice(tick)
		return [
			{
				tick,
				rate: isBid ? price : 1 / price,
				amountIn: formatUnits(amountIn, from.decimals),
				cumulativeIn: formatUnits(cumulative, from.decimals),
			},
		]
	})
}

export const fetchDexLegDepth = createServerFn({ method: 'POST' })
	.inputValidator((input) => depthInputSchema.parse(input))
	.handler(({ data }) => withDeadline(getDexLegDepth(data)))

function rescale(value: bigint, from: number, to: number): bigint {
	return to >= from
		? value * 10n ** BigInt(to - from)
		: value / 10n ** BigInt(from - to)
}

function tickPrice(tick: number): number {
	return (100_000 + tick) / 100_000
}

async function withDeadline<T>(read: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			read,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error('Stablecoin DEX request timed out. Please try again.'),
						),
					15_000,
				)
			}),
		])
	} finally {
		clearTimeout(timer)
	}
}
