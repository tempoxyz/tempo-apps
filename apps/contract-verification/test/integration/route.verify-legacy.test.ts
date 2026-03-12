import * as CBOR from 'cbor-x'
import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { Hex } from 'ox'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as DB from '#database/schema.ts'
import { chainIds } from '#wagmi.config.ts'

const { mockCreatePublicClient, mockGetRandom } = vi.hoisted(() => ({
	mockCreatePublicClient: vi.fn(),
	mockGetRandom: vi.fn(),
}))

vi.mock('@cloudflare/containers', () => ({
	getRandom: mockGetRandom,
}))

vi.mock('viem', async (importOriginal) => {
	const actual = await importOriginal<typeof import('viem')>()
	return {
		...actual,
		createPublicClient: mockCreatePublicClient,
	}
})

function createVyperBytecode(prefix: string): `0x${string}` {
	const metadata = [prefix.length / 2, [], 0, { vyper: [0, 3, 10] }]
	const cborHex = Hex.fromBytes(CBOR.encode(metadata)).slice(2)
	const lengthSuffix = ((cborHex.length + 4) / 2).toString(16).padStart(4, '0')
	return `0x${prefix}${cborHex}${lengthSuffix}`
}

function bytesToHex(value: unknown): `0x${string}` | null {
	if (value instanceof Uint8Array) return Hex.fromBytes(value)
	if (value instanceof ArrayBuffer) return Hex.fromBytes(new Uint8Array(value))
	return null
}

describe('POST /verify/vyper', () => {
	beforeEach(() => {
		vi.resetModules()
		mockCreatePublicClient.mockReset()
		mockGetRandom.mockReset()
	})

	it('stores deployment metadata when creatorTxHash is provided', async () => {
		const chainId = chainIds[0]
		const address = '0x1111111111111111111111111111111111111111' as const
		const creatorTxHash =
			'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
		const deployer = '0x2222222222222222222222222222222222222222' as const
		const runtimeBytecode = createVyperBytecode('6000')
		const creationBytecode = createVyperBytecode('60016000')
		const getCode = async () => runtimeBytecode
		const getTransactionReceipt = async () => ({
			transactionHash: creatorTxHash,
			blockNumber: 123n,
			transactionIndex: 7,
			from: deployer,
			contractAddress: address,
		})
		mockCreatePublicClient.mockReturnValue({
			getCode,
			getTransactionReceipt,
		})
		mockGetRandom.mockResolvedValue({
			fetch: async () =>
				Response.json({
					contracts: {
						'vyper-contract.vy': {
							VyperContract: {
								abi: [
									{
										type: 'function',
										name: 'set_value',
										inputs: [{ type: 'uint256', name: '_value' }],
									},
								],
								evm: {
									bytecode: {
										object: creationBytecode.slice(2),
										sourceMap: '',
									},
									deployedBytecode: {
										object: runtimeBytecode.slice(2),
										sourceMap: '',
									},
								},
								metadata: '{}',
							},
						},
					},
				}),
		})
		const { legacyVerifyRoute } = await import('#route.verify-legacy.ts')

		const app = new Hono<{ Bindings: Cloudflare.Env }>()
		app.route('/verify', legacyVerifyRoute)

		const response = await app.request(
			'/verify/vyper',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					address,
					chain: chainId,
					files: {
						'vyper-contract.vy':
							'# @version ^0.3.10\n\n@external\ndef set_value(_value: uint256):\n    pass\n',
					},
					contractPath: 'vyper-contract.vy',
					contractName: 'VyperContract',
					compilerVersion: '0.3.10',
					creatorTxHash,
				}),
			},
			env,
		)

		expect(response.status).toBe(200)
		expect(mockCreatePublicClient).toHaveBeenCalledTimes(1)
		expect(mockGetRandom).toHaveBeenCalledTimes(1)

		const db = drizzle(env.CONTRACTS_DB)
		const deployments = await db.select().from(DB.contractDeploymentsTable)

		expect(deployments).toHaveLength(1)
		expect(bytesToHex(deployments[0]?.transactionHash ?? null)).toBe(
			creatorTxHash,
		)
		expect(deployments[0]?.blockNumber).toBe(123)
		expect(deployments[0]?.transactionIndex).toBe(7)
		expect(bytesToHex(deployments[0]?.deployer ?? null)).toBe(deployer)
	})
})
