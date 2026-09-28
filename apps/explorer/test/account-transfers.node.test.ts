import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAccountTransfers } from '#lib/server/token'

const { getTransfers } = vi.hoisted(() => ({ getTransfers: vi.fn() }))

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

vi.mock('#lib/server/tempo-api', () => ({
	api: { v1: { transfers: { $get: getTransfers } } },
}))

vi.mock('#wagmi.config.ts', () => ({
	getWagmiConfig: () => ({ state: { chainId: 4217 } }),
}))

const account = '0x286ad6cfc7279c8a6d86d15dcefcb77a65aa7e92'

beforeEach(() => {
	getTransfers.mockReset()
	getTransfers.mockResolvedValue(
		Response.json({
			data: [],
			nextCursor: null,
			meta: { totalCount: 12, totalCountCapped: false },
		}),
	)
})

describe('account transfer direction', () => {
	it.each([
		{ direction: undefined, predicate: { address: account } },
		{ direction: 'in' as const, predicate: { recipient: account } },
		{ direction: 'out' as const, predicate: { sender: account } },
	])('requests the $direction feed with its filtered count', async ({
		direction,
		predicate,
	}) => {
		const result = await fetchAccountTransfers({
			data: { account, page: 2, limit: 10, direction },
		})

		// The API rejects address combined with sender/recipient. Keep exactly
		// one predicate, including when requesting subsequent filtered pages.
		expect(getTransfers).toHaveBeenCalledExactlyOnceWith({
			query: {
				chainId: expect.any(String),
				...predicate,
				page: '2',
				limit: '10',
				include: 'totalCount',
			},
		})
		expect(result).toEqual({ transfers: [], total: 12, totalCapped: false })
	})
})
