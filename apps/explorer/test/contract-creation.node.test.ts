import { beforeEach, expect, it, vi } from 'vitest'
import { fetchContractCreationData } from '#lib/server/contract-creation'

const { client } = vi.hoisted(() => ({
	client: { getCode: vi.fn(), getBlockNumber: vi.fn(), getBlock: vi.fn() },
}))
vi.mock('#wagmi.config', () => ({ getWagmiConfig: () => ({}) }))
vi.mock('wagmi/actions', () => ({
	getChainId: () => 4217,
	getPublicClient: () => client,
}))

let addressId = 100
function nextAddress() {
	return `0x${(++addressId).toString(16).padStart(40, '0')}` as const
}

beforeEach(() => {
	vi.resetAllMocks()
	client.getBlockNumber.mockResolvedValue(100n)
	client.getBlock.mockResolvedValue({
		timestamp: 1767225600n,
		transactions: [],
	})
})

it.each([
	0n,
	1n,
	37n,
	100n,
])('finds the first block with code at %s, including genesis and factory deployments', async (deploymentBlock) => {
	client.getCode.mockImplementation(async ({ blockNumber }) =>
		blockNumber === undefined || blockNumber >= deploymentBlock
			? '0x6000'
			: '0x',
	)
	expect(await fetchContractCreationData(nextAddress())).toMatchObject({
		blockNumber: deploymentBlock,
		timestamp: 1767225600n,
		hash: null,
		from: null,
	})
	expect(client.getBlock).toHaveBeenCalledWith({
		blockNumber: deploymentBlock,
		includeTransactions: true,
	})
})

it.each([
	50n,
	0n,
])('rejects historical RPC failures at block %s and allows a retry', async (failedBlock) => {
	const address = nextAddress()
	client.getCode.mockImplementation(async ({ blockNumber }) => {
		if (blockNumber === failedBlock)
			throw new Error('Historical state unavailable')
		return '0x6000'
	})
	await expect(fetchContractCreationData(address)).rejects.toThrow(
		'Historical state unavailable',
	)
	expect(client.getBlock).not.toHaveBeenCalled()
	client.getCode.mockResolvedValue('0x6000')
	expect(await fetchContractCreationData(address)).toMatchObject({
		blockNumber: 0n,
	})
})
