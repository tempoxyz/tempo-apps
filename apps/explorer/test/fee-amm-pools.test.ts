import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetChainId = vi.hoisted(() => vi.fn())
const mockReadContracts = vi.hoisted(() => vi.fn())
const mockGetTokenListEntries = vi.hoisted(() => vi.fn())
const mockFetchFeeAmmPoolPairs = vi.hoisted(() => vi.fn())

vi.mock('#wagmi.config', () => ({
	getWagmiConfig: () => ({}),
}))

vi.mock('wagmi/actions', () => ({
	getChainId: mockGetChainId,
	readContracts: mockReadContracts,
}))

vi.mock('#lib/server/tokens', () => ({
	getTokenListEntries: mockGetTokenListEntries,
}))

vi.mock('#lib/server/tempo-queries', () => ({
	fetchFeeAmmPoolPairs: mockFetchFeeAmmPoolPairs,
}))

import { Route } from '../src/routes/api/fee-amm/pools.ts'

describe('fee-amm pools route', () => {
	beforeEach(() => {
		mockGetChainId.mockReset()
		mockReadContracts.mockReset()
		mockGetTokenListEntries.mockReset()
		mockFetchFeeAmmPoolPairs.mockReset()
	})

	it('adds discovered fee amm pairs beyond the token-list candidate set', async () => {
		const pathUsd = '0x20c0000000000000000000000000000000000000' as const
		const usdc = '0x20c000000000000000000000b9537d11c60e8b50' as const
		const unrelatedToken = '0x1111111111111111111111111111111111111111' as const

		mockGetChainId.mockReturnValue(4217)
		mockGetTokenListEntries.mockResolvedValue([
			{
				address: pathUsd,
				name: 'PathUSD',
				symbol: 'PUSD',
				decimals: 6,
			},
			{
				address: unrelatedToken,
				name: 'Unrelated',
				symbol: 'UNRL',
				decimals: 18,
			},
		])
		mockFetchFeeAmmPoolPairs.mockResolvedValue([
			{ userToken: pathUsd, validatorToken: usdc },
		])
		mockReadContracts.mockResolvedValue([
			{
				status: 'success',
				result: {
					reserveUserToken: 0n,
					reserveValidatorToken: 0n,
				},
			},
			{
				status: 'success',
				result: {
					reserveUserToken: 5n,
					reserveValidatorToken: 8n,
				},
			},
			{
				status: 'success',
				result: {
					reserveUserToken: 0n,
					reserveValidatorToken: 0n,
				},
			},
			{
				status: 'success',
				result: {
					reserveUserToken: 0n,
					reserveValidatorToken: 0n,
				},
			},
			{
				status: 'success',
				result: {
					reserveUserToken: 0n,
					reserveValidatorToken: 0n,
				},
			},
			{
				status: 'success',
				result: {
					reserveUserToken: 0n,
					reserveValidatorToken: 0n,
				},
			},
		])

		const getHandler = Route.options.server?.handlers?.GET
		if (!getHandler) throw new Error('Missing GET handler')

		const response = await getHandler()
		const json = await response.json()

		expect(mockReadContracts).toHaveBeenCalledTimes(1)
		const contracts = mockReadContracts.mock.calls[0]?.[1]?.contracts
		expect(contracts).toHaveLength(6)
		expect(contracts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ args: [pathUsd, unrelatedToken] }),
				expect.objectContaining({ args: [unrelatedToken, pathUsd] }),
				expect.objectContaining({ args: [pathUsd, usdc] }),
				expect.objectContaining({ args: [usdc, pathUsd] }),
				expect.objectContaining({ args: [unrelatedToken, usdc] }),
				expect.objectContaining({ args: [usdc, unrelatedToken] }),
			]),
		)

		expect(json).toEqual({
			pools: [
				{
					userToken: pathUsd,
					validatorToken: usdc,
					reserveUserToken: '5',
					reserveValidatorToken: '8',
				},
			],
			tokens: [
				{
					address: pathUsd,
					name: 'PathUSD',
					symbol: 'PUSD',
					decimals: 6,
				},
				{
					address: usdc,
					name: 'Bridged USDC (Stargate)',
					symbol: 'USDC.e',
				},
			],
		})
	})
})
