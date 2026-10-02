import { describe, expect, it, vi } from 'vitest'
import { fetchTokens, sortTokensByCirculatingSupply } from '#lib/server/tokens'

const { getTokens, readContracts } = vi.hoisted(() => ({
	getTokens: vi.fn(),
	readContracts: vi.fn(),
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-start')>()),
	createServerFn: () => ({
		inputValidator: (validate: (data: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validate(input.data) }),
		}),
	}),
}))

vi.mock('wagmi/actions', () => ({
	getChainId: () => 4217,
	readContracts,
}))

vi.mock('#lib/server/tempo-api', () => ({
	api: { v1: { tokens: { $get: getTokens } } },
}))

vi.mock('#wagmi.config.ts', () => ({
	getWagmiConfig: () => ({ state: { chainId: 4217 } }),
}))

describe('sortTokensByCirculatingSupply', () => {
	it('ranks USD tokens by supply, then other currencies, then unknown supply', () => {
		const tokens = [
			{ symbol: 'NONE', currency: 'USD', circulatingSupply: undefined },
			{ symbol: 'EURC', currency: 'EUR', circulatingSupply: '1421704.5' },
			{ symbol: 'SMALL', currency: 'USD', circulatingSupply: '1120' },
			{ symbol: 'BIG', currency: 'USD', circulatingSupply: '434195711.25' },
			{ symbol: 'BRLA', currency: 'BRL', circulatingSupply: '50100' },
			{ symbol: 'MID', currency: 'USD', circulatingSupply: '87278935' },
		]

		expect(
			sortTokensByCirculatingSupply(tokens).map((token) => token.symbol),
		).toEqual(['BIG', 'MID', 'SMALL', 'EURC', 'BRLA', 'NONE'])
	})

	it('keeps input order for equal supplies', () => {
		const tokens = [
			{ symbol: 'A', currency: 'USD', circulatingSupply: '10' },
			{ symbol: 'B', currency: 'USD', circulatingSupply: '10' },
		]

		expect(
			sortTokensByCirculatingSupply(tokens).map((token) => token.symbol),
		).toEqual(['A', 'B'])
	})
})

describe('fetchTokens', () => {
	it('reads supplies onchain and sorts the verified list by them', async () => {
		const token = (address: string, symbol: string) => ({
			address,
			symbol,
			name: symbol,
			currency: 'USD',
			decimals: 6,
			transferStats: { count: 1, firstAt: '2026-01-01T00:00:00Z' },
		})
		getTokens.mockResolvedValue(
			Response.json({
				data: [
					token('0x20c0000000000000000000000000000000000001', 'SMALL'),
					token('0x20c0000000000000000000000000000000000002', 'NONE'),
					token('0x20c0000000000000000000000000000000000003', 'BIG'),
				],
				nextCursor: null,
			}),
		)
		readContracts.mockResolvedValue([
			{ status: 'success', result: 1_500_000n },
			{ status: 'failure', error: new Error('reverted') },
			{ status: 'success', result: 434_195_711_250_000n },
		])

		const result = await fetchTokens({ data: { page: 1, limit: 25 } })

		expect(
			result.tokens.map(({ symbol, circulatingSupply }) => ({
				symbol,
				circulatingSupply,
			})),
		).toEqual([
			{ symbol: 'BIG', circulatingSupply: '434195711.25' },
			{ symbol: 'SMALL', circulatingSupply: '1.5' },
			{ symbol: 'NONE', circulatingSupply: undefined },
		])
		expect(readContracts.mock.calls[0]?.[1].contracts).toHaveLength(3)
	})
})
