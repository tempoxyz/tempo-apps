import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getCode: vi.fn(),
	hasIndexSupply: vi.fn(),
	getBatchedClient: vi.fn(),
	getTempoChain: vi.fn(),
	isTip20Address: vi.fn(),
	validateVirtualAddress: vi.fn(),
	fetchAddressTxAggregate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (config: unknown) => ({
		options: config,
	}),
}))

vi.mock('viem/actions', () => ({
	getCode: mocks.getCode,
}))

vi.mock('#lib/env', () => ({
	hasIndexSupply: mocks.hasIndexSupply,
}))

vi.mock('#wagmi.config.ts', () => ({
	getBatchedClient: mocks.getBatchedClient,
	getTempoChain: mocks.getTempoChain,
}))

vi.mock('#lib/domain/tip20', () => ({
	isTip20Address: mocks.isTip20Address,
}))

vi.mock('ox/tempo', () => ({
	VirtualAddress: {
		validate: mocks.validateVirtualAddress,
	},
}))

vi.mock('#lib/server/tempo-queries', () => ({
	fetchAddressTxAggregate: mocks.fetchAddressTxAggregate,
	fetchTokenHoldersCountRows: vi.fn(),
	fetchTokenTransferAggregate: vi.fn(),
	fetchVirtualAddressTransferAggregate: vi.fn(),
}))

import { Route } from '../src/routes/api/address/metadata/$address'

describe('/api/address/metadata/$address', () => {
	const address = '0x112fd4042E442C3C12C67AD23587b0afe36eB74E'
	const handler = Route.options.server.handlers.GET

	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getTempoChain.mockReturnValue({ id: 31318 })
		mocks.getBatchedClient.mockReturnValue({})
		mocks.hasIndexSupply.mockReturnValue(true)
		mocks.isTip20Address.mockReturnValue(false)
		mocks.validateVirtualAddress.mockReturnValue(false)
	})

	it('uses the active chain id in fallback responses', async () => {
		mocks.hasIndexSupply.mockReturnValue(false)

		const response = await handler({ params: { address } })

		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toMatchObject({
			address,
			chainId: 31318,
			accountType: 'empty',
		})
	})

	it('keeps contract account type when tx aggregate fetch fails', async () => {
		mocks.getCode.mockResolvedValue('0x60016000')
		mocks.fetchAddressTxAggregate.mockRejectedValue(new Error('Status: 400'))

		const response = await handler({ params: { address } })

		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toMatchObject({
			address,
			chainId: 31318,
			accountType: 'contract',
		})
	})
})
