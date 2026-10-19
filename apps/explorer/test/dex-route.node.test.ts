import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address } from 'viem'
import {
	BaseError,
	ContractFunctionRevertedError,
	encodeErrorResult,
} from 'viem'
import { Addresses } from 'viem/tempo'
import { Abis } from '#lib/abis'
import {
	dexRouteSearchSchema,
	parseRouteAmount,
	quoteImpact,
	resolveDexPath,
} from '#lib/dex-route'
import { getDexLegDepth, getDexRoute } from '#lib/server/dex-route'

const { readContract, getMetadata } = vi.hoisted(() => ({
	readContract: vi.fn(),
	getMetadata: vi.fn(),
}))
vi.mock('#wagmi.config', () => ({
	getBatchedClient: () => ({
		getBlockNumber: async () => 100n,
		token: { getMetadata },
		readContract,
	}),
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

describe('Stablecoin DEX route', () => {
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
		expect(dexRouteSearchSchema.parse({ amount: 100 })).toEqual({
			amount: '100',
		})
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
	it('looks up reverse legs with the same base and quote order', async () => {
		const snapshot = await getDexRoute({
			from: ROOT,
			to: USDT,
			amount: '10000',
		})
		expect(
			readContract.mock.calls
				.filter(([request]) => request.functionName === 'pairKey')
				.map(([request]) => request.args),
		).toEqual([
			[OUSD, ROOT],
			[USDT, OUSD],
		])
		expect(snapshot.legs.map((leg) => leg.isBid)).toEqual([false, false])
		expect(snapshot.legs.map((leg) => leg.bestTick)).toEqual([20, 20])
		expect(snapshot.legs.map((leg) => leg.bestRate)).toEqual([
			1 / 1.0002,
			1 / 1.0002,
		])
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
		expect(snapshot.reference.status).toBe('unavailable')
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
	it('reports depth in input-token units from the best tick outward', async () => {
		const previous = readContract.getMockImplementation()
		readContract.mockImplementation(async (request) => {
			if (request.functionName === 'TICK_SPACING') return 10
			if (request.functionName === 'getTickLevel') {
				const [, tick] = request.args
				return [0n, 0n, tick === 20 || tick === 40 ? 1_000_000n : 0n]
			}
			return previous?.(request)
		})
		const asks = await getDexLegDepth({
			from: OUSD,
			to: USDT,
			tick: 20,
			blockNumber: '100',
		})
		expect(asks).toEqual([
			{
				tick: 20,
				rate: 1 / 1.0002,
				amountIn: '1.0002',
				cumulativeIn: '1.0002',
			},
			{
				tick: 40,
				rate: 1 / 1.0004,
				amountIn: '1.0004',
				cumulativeIn: '2.0006',
			},
		])
		expect(
			readContract.mock.calls
				.filter(([request]) => request.functionName === 'getTickLevel')
				.map(([request]) => request.args),
		).toContainEqual([USDT, 30, false])
		for (const [request] of readContract.mock.calls)
			expect(request.blockNumber).toBe(100n)

		readContract.mockClear()
		const bids = await getDexLegDepth({
			from: USDT,
			to: OUSD,
			tick: 40,
			blockNumber: '100',
		})
		expect(bids.map((level) => [level.tick, level.amountIn])).toEqual([
			[40, '1'],
			[20, '1'],
		])
	})
})
