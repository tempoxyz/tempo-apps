import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pad } from 'viem'
import { Addresses } from 'viem/tempo'
import { QB } from 'tidx.ts'
import { feeAmmSearchSchema } from '#lib/fee-amm'
import { getFeeAmmPools, mapFeeAmmPools } from '#lib/server/fee-amm'

const { getPools, queryIndex, getMetadata, readContract } = vi.hoisted(() => ({
	getPools: vi.fn(),
	queryIndex: vi.fn(),
	getMetadata: vi.fn(),
	readContract: vi.fn(),
}))
vi.mock('#lib/server/tempo-api', () => ({
	api: { v1: { 'fee-amm': { pools: { $get: getPools } } } },
}))
vi.mock('#lib/server/tempo-queries-provider', () => ({
	tempoQueryBuilder: (chainId: number, options: { engine: string }) =>
		QB.from({ chainId, ...options, fetch: queryIndex, live: vi.fn() }),
}))
vi.mock('#wagmi.config', () => ({
	getWagmiConfig: () => ({ state: { chainId: 4217 } }),
	getBatchedClient: () => ({ token: { getMetadata }, readContract }),
}))

const OUSD = '0x20c0000000000000000000006a37da5c996874be'
const PATH = Addresses.pathUsd

beforeEach(() => {
	vi.resetAllMocks()
	getMetadata.mockImplementation(async ({ token }) => ({
		name: token === OUSD ? 'OpenUSD' : 'pathUSD',
		symbol: token === OUSD ? 'OUSD' : 'pathUSD',
		decimals: 6,
		currency: 'USD',
	}))
	readContract.mockResolvedValue({
		reserveUserToken: 24n,
		reserveValidatorToken: 49999977n,
	})
})

describe('Fee AMM pagination and token discovery', () => {
	it('forwards page and limit and uses nextCursor even when a page is short', async () => {
		getPools.mockResolvedValue(
			Response.json({ data: [], nextCursor: 'another-page' }),
		)
		expect(await getFeeAmmPools({ page: 2, limit: 25 })).toEqual({
			pools: [],
			hasMore: true,
		})
		expect(getPools).toHaveBeenCalledWith({
			query: { chainId: '4217', page: '2', limit: '25' },
		})
		getPools.mockResolvedValue(Response.json({ data: [], nextCursor: null }))
		expect((await getFeeAmmPools({ page: 3, limit: 25 })).hasMore).toBe(false)
	})
	it('propagates upstream failures rather than reporting an empty market', async () => {
		getPools.mockResolvedValue(
			Response.json({ error: 'unavailable' }, { status: 503 }),
		)
		await expect(getFeeAmmPools({ page: 1, limit: 10 })).rejects.toThrow()
	})
	it('finds token pools independently of the global first page and includes both directions', async () => {
		queryIndex.mockResolvedValue({ rows: [row(OUSD, PATH), row(PATH, OUSD)] })
		const page = await getFeeAmmPools({ token: OUSD, page: 1, limit: 10 })
		expect(getPools).not.toHaveBeenCalled()
		expect(
			page.pools.map((pool) => [pool.userToken, pool.validatorToken]),
		).toEqual([
			[OUSD, PATH],
			[PATH, OUSD],
		])
		expect(page.pools[0]).toMatchObject({
			reserveUserToken: 24n,
			reserveValidatorToken: 49999977n,
			userTokenSymbol: 'OUSD',
		})
		expect(page.pools[0]?.liquidityUsd).toBeCloseTo(50.000001, 6)
		expect(getMetadata).toHaveBeenCalledTimes(2)
		expect(queryIndex.mock.calls[0]?.[0]).toMatchObject({
			chainId: 4217,
			engine: 'clickhouse',
		})
		const sql = queryIndex.mock.calls[0]?.[0].query as string
		expect(sql).toContain(
			`("topic2" = '${pad(OUSD)}' or "topic3" = '${pad(OUSD)}')`,
		)
		expect(sql).toContain('group by "topic2", "topic3"')
		expect(sql).toContain(
			'order by "mintCount" desc, "topic2" desc, "topic3" desc limit 11 offset 0',
		)
		expect(page.hasMore).toBe(false)
	})
	it('uses a lookahead row without fetching its reserves or exposing it on this page', async () => {
		queryIndex.mockResolvedValue({
			rows: Array.from({ length: 11 }, () => row(OUSD, PATH)),
		})
		const page = await getFeeAmmPools({ token: OUSD, page: 2, limit: 10 })
		expect(page.pools).toHaveLength(10)
		expect(page.hasMore).toBe(true)
		expect(readContract).toHaveBeenCalledTimes(10)
		expect(queryIndex.mock.calls[0]?.[0].query).toContain('limit 11 offset 10')
	})
	it('distinguishes missing reserves from a genuinely empty pool', async () => {
		queryIndex.mockResolvedValue({ rows: [row(OUSD, PATH)] })
		readContract.mockRejectedValue(new Error('RPC down'))
		expect(
			(await getFeeAmmPools({ token: OUSD, page: 1, limit: 10 })).pools[0],
		).toMatchObject({
			reserveUserToken: null,
			reserveValidatorToken: null,
			liquidityUsd: null,
		})
		readContract.mockResolvedValue({
			reserveUserToken: 0n,
			reserveValidatorToken: 0n,
		})
		expect(
			(await getFeeAmmPools({ token: OUSD, page: 1, limit: 10 })).pools[0]
				?.liquidityUsd,
		).toBe(0)
	})
	it('does not price a non-USD pool as USD', async () => {
		queryIndex.mockResolvedValue({ rows: [row(OUSD, PATH)] })
		getMetadata.mockResolvedValue({
			name: 'Euro',
			symbol: 'EUR',
			currency: 'EUR',
			decimals: 6,
		})
		expect(
			(await getFeeAmmPools({ token: OUSD, page: 1, limit: 10 })).pools[0]
				?.liquidityUsd,
		).toBeNull()
	})
})

describe('Fee AMM URL validation', () => {
	it('normalizes token URLs and supplies pagination defaults', () => {
		expect(
			feeAmmSearchSchema.parse({
				token: '0x20c0000000000000000000006a37DA5C996874BE',
			}),
		).toEqual({ token: OUSD, page: 1, limit: 10 })
	})
	it.each([
		{ token: 'not-an-address' },
		{ page: 0 },
		{ page: 1.5 },
		{ limit: 1000 },
		{ page: 201, limit: 50 },
	])('rejects invalid or unbounded requests: %j', (input) => {
		expect(feeAmmSearchSchema.safeParse(input).success).toBe(false)
	})
})

function row(userToken: `0x${string}`, validatorToken: `0x${string}`) {
	return {
		topic2: pad(userToken),
		topic3: pad(validatorToken),
		mintCount: 1,
		createdAt: '2026-09-18T12:00:00Z',
		lastMintAt: '2026-09-18T12:00:00Z',
	}
}

describe('mapFeeAmmPools', () => {
	it('maps reserve amounts separately from token metadata', () => {
		const [pool] = mapFeeAmmPools([
			{
				createdAt: '2026-07-22T00:00:00.000Z',
				id: `0x${'11'.repeat(32)}`,
				lastMintAt: '2026-07-22T01:00:00.000Z',
				mintCount: 2,
				poolId: `0x${'11'.repeat(32)}`,
				userAmount: {
					baseUnits: '1250000',
					currency: 'USD',
					decimals: 6,
					formatted: '1.25',
				},
				userToken: {
					address: `0x${'22'.repeat(20)}`,
					currency: 'USD',
					decimals: 6,
					name: 'Alpha USD',
					symbol: 'aUSD',
				},
				validatorAmount: {
					baseUnits: '2500000',
					currency: 'USD',
					decimals: 6,
					formatted: '2.5',
				},
				validatorToken: {
					address: `0x${'33'.repeat(20)}`,
					currency: 'USD',
					decimals: 6,
					name: 'Beta USD',
					symbol: 'bUSD',
				},
			},
		])

		expect(pool).toMatchInlineSnapshot(`
			{
			  "createdAt": 1784678400,
			  "latestMintAt": 1784682000,
			  "liquidityUsd": 3.75,
			  "mintCount": 2,
			  "poolId": "0x1111111111111111111111111111111111111111111111111111111111111111",
			  "reserveUserToken": 1250000n,
			  "reserveValidatorToken": 2500000n,
			  "userToken": "0x2222222222222222222222222222222222222222",
			  "userTokenDecimals": 6,
			  "userTokenName": "Alpha USD",
			  "userTokenSymbol": "aUSD",
			  "validatorToken": "0x3333333333333333333333333333333333333333",
			  "validatorTokenDecimals": 6,
			  "validatorTokenName": "Beta USD",
			  "validatorTokenSymbol": "bUSD",
			}
		`)
	})
})
