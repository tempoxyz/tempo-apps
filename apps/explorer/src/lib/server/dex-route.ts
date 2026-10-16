import { createServerFn } from '@tanstack/react-start'
import {
	BaseError,
	ContractFunctionRevertedError,
	decodeEventLog,
	decodeFunctionData,
	formatUnits,
	pad,
	parseAbiItem,
	type Address,
} from 'viem'
import { Addresses } from 'viem/tempo'
import { Abis } from '#lib/abis'
import {
	dexRouteSearchSchema,
	parseRouteAmount,
	resolveDexPath,
	type DexQuote,
	type DexRouteSearch,
	type DexToken,
} from '#lib/dex-route'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import { parseTimestamp } from '#lib/timestamp'
import { getBatchedClient, getTempoChain } from '#wagmi.config'

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
	depth: DexQuote[]
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
	input: DexRouteSearch,
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
	const [selected, reference, ...depth] = await Promise.all([
		inputError
			? Promise.resolve<DexQuote>({
					amountIn: input.amount,
					amountOut: null,
					status: 'unavailable',
				})
			: quote(input.amount),
		quote('1'),
		...['100', '1000', '10000', '100000', '1000000'].map(quote),
	])
	return {
		blockNumber: String(blockNumber),
		path,
		legs,
		quote: selected,
		reference,
		depth,
		inputError,
	}
}

export const fetchDexRoute = createServerFn({ method: 'POST' })
	.inputValidator((input) => dexRouteSearchSchema.parse(input))
	.handler(async ({ data }) => {
		try {
			return await withDeadline(getDexRoute(data))
		} catch {
			throw new Error(
				'The native DEX route is temporarily unavailable. Check the token addresses or try again.',
			)
		}
	})

export type DexSwap = {
	hash: `0x${string}`
	timestamp: number | null
	amountIn: string
	amountOut: string
}
const transfer = parseAbiItem(
	'event Transfer(address indexed from, address indexed to, uint256 value)',
)

/** Only label a swap when its calldata and successful settlement agree. */
export async function getDexRouteSwaps(
	data: DexRouteSearch,
): Promise<DexSwap[]> {
	const client = getBatchedClient()
	const [from, to, rows] = await Promise.all([
		client.token.getMetadata({ token: data.from }),
		client.token.getMetadata({ token: data.to }),
		tempoQueryBuilder(getTempoChain().id, { engine: 'clickhouse' })
			.selectFrom('logs')
			.select(['tx_hash', 'block_timestamp'])
			.where('address', '=', data.to)
			.where(
				'selector',
				'=',
				'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
			)
			.where('topic1', '=', pad(Addresses.stablecoinDex))
			.orderBy('block_num', 'desc')
			.orderBy('log_idx', 'desc')
			.limit(20)
			.execute(),
	])
	const candidates = [
		...new Map(rows.map((row) => [String(row.tx_hash), row])).values(),
	].slice(0, 12)
	const swaps = await Promise.all(
		candidates.map(async (row): Promise<DexSwap | null> => {
			const hash = row.tx_hash as `0x${string}`
			const tx = await client.getTransaction({ hash })
			if (tx.to?.toLowerCase() !== Addresses.stablecoinDex || !tx.input)
				return null
			let decoded: ReturnType<
				typeof decodeFunctionData<typeof Abis.stablecoinDex>
			>
			try {
				decoded = decodeFunctionData({
					abi: Abis.stablecoinDex,
					data: tx.input,
				})
			} catch {
				return null
			}
			if (decoded.functionName !== 'swapExactAmountIn') return null
			const [tokenIn, tokenOut, amountIn] = decoded.args
			if (
				tokenIn.toLowerCase() !== data.from ||
				tokenOut.toLowerCase() !== data.to
			)
				return null
			const receipt = await client.getTransactionReceipt({ hash })
			if (receipt.status !== 'success') return null
			let amountOut = 0n
			for (const log of receipt.logs) {
				if (log.address.toLowerCase() !== data.to) continue
				try {
					const event = decodeEventLog({
						abi: [transfer],
						data: log.data,
						topics: log.topics,
					})
					if (
						event.args.from.toLowerCase() === Addresses.stablecoinDex &&
						event.args.to.toLowerCase() === tx.from.toLowerCase()
					)
						amountOut += event.args.value
				} catch {
					/* Other token events are not settlement transfers. */
				}
			}
			if (!amountOut) return null
			return {
				hash,
				timestamp: parseTimestamp(row.block_timestamp) ?? null,
				amountIn: formatUnits(amountIn, from.decimals),
				amountOut: formatUnits(amountOut, to.decimals),
			}
		}),
	)
	return swaps.filter((swap): swap is DexSwap => swap !== null).slice(0, 10)
}

export const fetchDexRouteSwaps = createServerFn({ method: 'POST' })
	.inputValidator((input) => dexRouteSearchSchema.parse(input))
	.handler(({ data }) => withDeadline(getDexRouteSwaps(data)))

async function withDeadline<T>(read: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			read,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error('Native DEX request timed out. Please try again.'),
						),
					15_000,
				)
			}),
		])
	} finally {
		clearTimeout(timer)
	}
}
