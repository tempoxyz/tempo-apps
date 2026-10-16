import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address } from 'viem'
import {
	BaseError,
	ContractFunctionRevertedError,
	encodeAbiParameters,
	encodeErrorResult,
	encodeEventTopics,
	encodeFunctionData,
	parseAbiItem,
} from 'viem'
import { QB } from 'tidx.ts'
import { Addresses } from 'viem/tempo'
import { Abis } from '#lib/abis'
import {
	dexRouteSearchSchema,
	parseRouteAmount,
	quoteImpact,
	resolveDexPath,
} from '#lib/dex-route'
import { getDexRoute, getDexRouteSwaps } from '#lib/server/dex-route'

const {
	readContract,
	getMetadata,
	getTransaction,
	getTransactionReceipt,
	queryIndex,
} = vi.hoisted(() => ({
	readContract: vi.fn(),
	getMetadata: vi.fn(),
	getTransaction: vi.fn(),
	getTransactionReceipt: vi.fn(),
	queryIndex: vi.fn(),
}))
vi.mock('#wagmi.config', () => ({
	getBatchedClient: () => ({
		getBlockNumber: async () => 100n,
		token: { getMetadata },
		readContract,
		getTransaction,
		getTransactionReceipt,
	}),
	getTempoChain: () => ({ id: 4217 }),
}))
vi.mock('#lib/server/tempo-queries-provider', () => ({
	tempoQueryBuilder: (chainId: number, options: { engine: string }) =>
		QB.from({ chainId, ...options, fetch: queryIndex, live: vi.fn() }),
}))

const USDT = '0x20c00000000000000000000014f22ca97301eb73'
const OUSD = '0x20c0000000000000000000006a37da5c996874be'
const SIBLING = '0x20c0000000000000000000000000000000000001'
const ROOT = Addresses.pathUsd
const parents = new Map<Address, Address>([
	[USDT, OUSD],
	[OUSD, ROOT],
	[SIBLING, OUSD],
])

beforeEach(() => {
	vi.resetAllMocks()
	getMetadata.mockImplementation(async ({ token }) => ({
		symbol: token === USDT ? 'USDT0' : token === OUSD ? 'OUSD' : 'pathUSD',
		decimals: 6,
		quoteToken: parents.get(token),
	}))
	readContract.mockImplementation(async ({ functionName, args }) => {
		if (functionName === 'MIN_TICK') return -2000
		if (functionName === 'MAX_TICK') return 2000
		if (functionName === 'pairKey') return `0x${'a'.repeat(64)}`
		if (functionName === 'books')
			return { base: USDT, quote: OUSD, bestBidTick: -10, bestAskTick: 20 }
		if (functionName === 'quoteSwapExactAmountIn')
			return (args[2] * 999n) / 1000n
		throw new Error('Unexpected contract read')
	})
})

describe('native DEX route', () => {
	it('follows the active quote token instead of an old direct book', async () => {
		expect(
			await resolveDexPath(USDT, ROOT, async (token) => parents.get(token)),
		).toEqual([USDT, OUSD, ROOT])
		expect(
			await resolveDexPath(ROOT, USDT, async (token) => parents.get(token)),
		).toEqual([ROOT, OUSD, USDT])
		expect(
			await resolveDexPath(USDT, SIBLING, async (token) => parents.get(token)),
		).toEqual([USDT, OUSD, SIBLING])
	})
	it('uses the direct-pair fast path without depending on ancestors', async () => {
		expect(
			await resolveDexPath(USDT, OUSD, async (token) =>
				token === USDT ? OUSD : undefined,
			),
		).toEqual([USDT, OUSD])
	})
	it('rejects identical tokens, cycles and broken paths', async () => {
		await expect(
			resolveDexPath(ROOT, ROOT, async () => undefined),
		).rejects.toThrow('Choose two different tokens.')
		await expect(
			resolveDexPath(USDT, ROOT, async (token) =>
				token === ROOT ? undefined : USDT,
			),
		).rejects.toThrow('The quote-token path is incomplete or contains a cycle.')
		await expect(
			resolveDexPath(USDT, ROOT, async () => undefined),
		).rejects.toThrow('The quote-token path is incomplete or contains a cycle.')
	})
	it('rejects overprecision and uint128 overflow without rounding', () => {
		expect(parseRouteAmount('0.000001', 6)).toBe(1n)
		expect(() => parseRouteAmount('0.0000001', 6)).toThrow(
			'Use at most 6 decimal places.',
		)
		expect(() => parseRouteAmount('0', 6)).toThrow(
			'Enter an amount greater than zero and within the DEX limit.',
		)
		expect(() =>
			parseRouteAmount('340282366920938463463374607431768.211456', 6),
		).toThrow('Enter an amount greater than zero and within the DEX limit.')
		expect(dexRouteSearchSchema.safeParse({ amount: '1e10' }).success).toBe(
			false,
		)
	})
	it('pins metadata, books and every size quote to one block', async () => {
		const snapshot = await getDexRoute({
			from: USDT,
			to: ROOT,
			amount: '10000',
		})
		expect(snapshot.path.map((token) => token.address)).toEqual([
			USDT,
			OUSD,
			ROOT,
		])
		expect(snapshot.quote).toEqual({
			amountIn: '10000',
			amountOut: '9990',
			status: 'quoted',
		})
		expect(snapshot.blockNumber).toBe('100')
		for (const [request] of readContract.mock.calls)
			expect(request.blockNumber).toBe(100n)
		for (const [request] of getMetadata.mock.calls)
			expect(request.blockNumber).toBe(100n)
	})
	it('does not turn RPC failures into zero liquidity or zero output', async () => {
		const previous = readContract.getMockImplementation()
		readContract.mockImplementation(async (request) => {
			if (request.functionName === 'quoteSwapExactAmountIn')
				throw new Error('RPC offline')
			return previous?.(request)
		})
		const snapshot = await getDexRoute({
			from: USDT,
			to: ROOT,
			amount: '10000',
		})
		expect(snapshot.quote).toEqual({
			amountIn: '10000',
			amountOut: null,
			status: 'unavailable',
		})
		expect(
			snapshot.depth.every((quote) => quote.status === 'unavailable'),
		).toBe(true)
	})
	it('distinguishes insufficient liquidity from unavailable RPC', async () => {
		const previous = readContract.getMockImplementation()
		readContract.mockImplementation(async (request) => {
			if (request.functionName === 'quoteSwapExactAmountIn')
				throw new BaseError('reverted', {
					cause: new ContractFunctionRevertedError({
						abi: Abis.stablecoinDex,
						functionName: 'quoteSwapExactAmountIn',
						data: encodeErrorResult({
							abi: Abis.stablecoinDex,
							errorName: 'InsufficientLiquidity',
						}),
					}),
				})
			return previous?.(request)
		})
		const snapshot = await getDexRoute({
			from: USDT,
			to: ROOT,
			amount: '10000',
		})
		expect(snapshot.quote).toEqual({
			amountIn: '10000',
			amountOut: null,
			status: 'no-liquidity',
		})
	})
	it('computes impact against a small-trade quote, not the dollar peg', () => {
		const reference = {
			amountIn: '1',
			amountOut: '0.99',
			status: 'quoted',
		} as const
		expect(
			quoteImpact(
				{ amountIn: '100', amountOut: '98.01', status: 'quoted' },
				reference,
			),
		).toBeCloseTo(100)
		expect(
			quoteImpact(
				{ amountIn: '100', amountOut: null, status: 'unavailable' },
				reference,
			),
		).toBeNull()
	})
	it('only labels verified direct swaps in the requested direction', async () => {
		const hash = `0x${'1'.repeat(64)}`
		const wallet = '0x1111111111111111111111111111111111111111'
		queryIndex.mockResolvedValue({
			rows: [{ tx_hash: hash, block_timestamp: 1000 }],
		})
		getTransaction.mockResolvedValue({
			to: Addresses.stablecoinDex,
			from: wallet,
			input: encodeFunctionData({
				abi: Abis.stablecoinDex,
				functionName: 'swapExactAmountIn',
				args: [USDT, ROOT, 10_000_000n, 0n],
			}),
		})
		getTransactionReceipt.mockResolvedValue({
			status: 'success',
			logs: [
				{
					address: ROOT,
					topics: encodeEventTopics({
						abi: [
							parseAbiItem(
								'event Transfer(address indexed from, address indexed to, uint256 value)',
							),
						],
						eventName: 'Transfer',
						args: { from: Addresses.stablecoinDex, to: wallet },
					}),
					data: encodeAbiParameters([{ type: 'uint256' }], [9_990_000n]),
				},
			],
		})
		expect(
			await getDexRouteSwaps({ from: USDT, to: ROOT, amount: '10' }),
		).toEqual([{ hash, timestamp: 1000, amountIn: '10', amountOut: '9.99' }])
		getTransaction.mockResolvedValue({ to: wallet })
		expect(
			await getDexRouteSwaps({ from: USDT, to: ROOT, amount: '10' }),
		).toEqual([])
	})
})
