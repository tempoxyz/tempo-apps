import { createServerFn } from '@tanstack/react-start'
import {
	BaseError,
	ContractFunctionRevertedError,
	formatUnits,
	type Address,
} from 'viem'
import { Addresses } from 'viem/tempo'
import { Abis } from '#lib/abis'
import {
	dexRouteInputSchema,
	parseRouteAmount,
	resolveDexPath,
	type DexQuote,
	type DexRouteInput,
	type DexToken,
} from '#lib/dex-route'
import { getBatchedClient } from '#wagmi.config'

export type DexLeg = {
	from: DexToken
	to: DexToken
	bookKey: `0x${string}`
	side: 'Sell base' | 'Buy base'
	exists: boolean
	bestRate: number | null
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
			const tick = sellBase ? book.bestBidTick : book.bestAskTick
			const hasPrice = exists && tick >= minTick && tick <= maxTick
			const price = (100_000 + tick) / 100_000
			return {
				from,
				to,
				bookKey,
				side: sellBase ? 'Sell base' : 'Buy base',
				exists,
				bestRate: hasPrice ? (sellBase ? price : 1 / price) : null,
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
