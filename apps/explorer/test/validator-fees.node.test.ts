import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QB } from 'tidx.ts'
import { pad, zeroAddress } from 'viem'
import { Addresses } from 'viem/tempo'
import { getValidatorFees } from '#lib/server/validator-fees'

const { queryIndex, readContract } = vi.hoisted(() => ({
	queryIndex: vi.fn(),
	readContract: vi.fn(),
}))
vi.mock('#lib/server/tempo-queries-provider', () => ({
	tempoQueryBuilder: (chainId: number, options: { engine: string }) =>
		QB.from({ chainId, ...options, fetch: queryIndex, live: vi.fn() }),
}))
vi.mock('#wagmi.config', () => ({
	getWagmiConfig: () => ({ state: { chainId: 4217 } }),
	getBatchedClient: () => ({ readContract }),
}))

const recipient = '0x1111111111111111111111111111111111111111'
const oldToken = '0x20c00000000000000000000000000000000000ab'
const currentToken = '0x20c00000000000000000000000000000000000cd'

beforeEach(() => {
	vi.resetAllMocks()
	queryIndex.mockResolvedValue({ rows: [] })
	queryIndex.mockResolvedValueOnce({ rows: [{ num: 1234n }] })
	readContract.mockImplementation(async ({ functionName }) => {
		if (functionName === 'validatorTokens') return zeroAddress
		if (functionName === 'symbol') return 'USD'
		if (functionName === 'name') return 'Test USD'
		if (functionName === 'currency') return 'USD'
		return 0n
	})
})

describe('unclaimed validator fees', () => {
	it('finds old, current and default tokens without needing any payout events', async () => {
		queryIndex.mockResolvedValueOnce({ rows: [{ topic2: pad(oldToken) }] })
		readContract.mockImplementation(async ({ functionName, args }) => {
			if (functionName === 'validatorTokens') return currentToken
			if (functionName === 'symbol') return 'USD'
			if (functionName === 'name') return 'Test USD'
			if (functionName === 'currency') return 'USD'
			return args[1] === oldToken ? 9876543210123456789n : 1n
		})
		expect(await getValidatorFees(recipient)).toEqual({
			blockNumber: '1234',
			fees: [
				{
					token: Addresses.pathUsd,
					amount: '1',
					symbol: 'USD',
					name: 'Test USD',
					currency: 'USD',
				},
				{
					token: oldToken,
					amount: '9876543210123456789',
					symbol: 'USD',
					name: 'Test USD',
					currency: 'USD',
				},
				{
					token: currentToken,
					amount: '1',
					symbol: 'USD',
					name: 'Test USD',
					currency: 'USD',
				},
			],
		})
		for (const [call] of readContract.mock.calls)
			expect(call.blockNumber).toBe(1234n)
		expect(queryIndex.mock.calls[1]?.[0]).toMatchObject({
			chainId: 4217,
			engine: 'clickhouse',
		})
		expect(queryIndex.mock.calls[1]?.[0].query).toMatchInlineSnapshot(
			`"select distinct "topic2" from "logs" where "address" = '0xfeec000000000000000000000000000000000000' and "selector" = '0x6eb51f8f7e857fb2caf4257da4219a86adeed7128412764e41334968165f5f0c' and "topic1" = '0x0000000000000000000000001111111111111111111111111111111111111111' and "block_num" <= 1234 order by "topic2" asc limit 100"`,
		)
	})
	it('continues after a short indexer page and deduplicates previously selected tokens', async () => {
		queryIndex
			.mockResolvedValueOnce({ rows: [{ topic2: pad(Addresses.pathUsd) }] })
			.mockResolvedValueOnce({ rows: [{ topic2: pad(oldToken) }] })
			.mockResolvedValueOnce({ rows: [{ topic2: pad(currentToken) }] })
		readContract.mockImplementation(async ({ functionName }) =>
			functionName === 'validatorTokens' ? currentToken : 0n,
		)
		expect(await getValidatorFees(recipient)).toEqual({
			blockNumber: '1234',
			fees: [],
		})
		expect(queryIndex).toHaveBeenCalledTimes(5)
		expect(
			readContract.mock.calls
				.filter(([call]) => call.functionName === 'collectedFees')
				.map(([call]) => call.args),
		).toEqual([
			[recipient, Addresses.pathUsd],
			[recipient, oldToken],
			[recipient, currentToken],
		])
		expect(queryIndex.mock.calls[3]?.[0].query).toContain(
			`"topic2" > '${pad(oldToken)}'`,
		)
	})
	it('includes the protocol default when no preference was ever set', async () => {
		expect(await getValidatorFees(recipient)).toEqual({
			blockNumber: '1234',
			fees: [],
		})
		expect(readContract.mock.calls[1]?.[0]).toMatchObject({
			functionName: 'collectedFees',
			args: [recipient, Addresses.pathUsd],
		})
	})
	it('does not report a zero balance when the indexer or a balance read fails', async () => {
		queryIndex.mockRejectedValueOnce(new Error('Indexer unavailable'))
		await expect(getValidatorFees(recipient)).rejects.toThrow(
			'Indexer unavailable',
		)
		queryIndex.mockResolvedValueOnce({ rows: [{ num: 1234n }] })
		readContract.mockImplementation(async ({ functionName }) => {
			if (functionName === 'validatorTokens') return zeroAddress
			throw new Error('RPC unavailable')
		})
		await expect(getValidatorFees(recipient)).rejects.toThrow('RPC unavailable')
	})
	it('preserves a nonzero balance when symbol metadata is unavailable', async () => {
		readContract.mockImplementation(async ({ functionName }) => {
			if (functionName === 'validatorTokens') return zeroAddress
			if (['symbol', 'name', 'currency'].includes(functionName))
				throw new Error('Metadata unavailable')
			return 1234567n
		})
		expect((await getValidatorFees(recipient)).fees).toEqual([
			{
				token: Addresses.pathUsd,
				amount: '1234567',
				symbol: null,
				name: null,
				currency: null,
			},
		])
	})
	it('rejects malformed history instead of silently omitting a token', async () => {
		queryIndex.mockResolvedValueOnce({ rows: [{ topic2: null }] })
		await expect(getValidatorFees(recipient)).rejects.toThrow(
			'Invalid fee token',
		)
	})
	it('fails when no indexed snapshot is available', async () => {
		queryIndex.mockReset().mockResolvedValue({ rows: [] })
		await expect(getValidatorFees(recipient)).rejects.toThrow(
			'Fee history is unavailable',
		)
		expect(readContract).not.toHaveBeenCalled()
	})
})
