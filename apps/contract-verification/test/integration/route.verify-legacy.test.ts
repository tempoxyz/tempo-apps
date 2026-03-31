import * as CBOR from 'cbor-x'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { Hash, Hex } from 'ox'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as DB from '#database/schema.ts'
import { staticChains } from '#wagmi.config.ts'
import { ChainRegistry } from '#lib/chain-registry.ts'
import type { AppEnv } from '#index.tsx'

const { mockCreatePublicClient, mockGetRandom } = vi.hoisted(() => ({
	mockCreatePublicClient: vi.fn(),
	mockGetRandom: vi.fn(),
}))

vi.mock('@cloudflare/containers', () => ({
	getRandom: mockGetRandom,
}))

vi.mock('viem', () => ({
	createPublicClient: mockCreatePublicClient,
	http: vi.fn(),
	keccak256: Hash.keccak256,
}))

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
		const chainId = staticChains[0].id
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

		const app = new Hono<AppEnv>()
		const registry = ChainRegistry.fromStatic(staticChains)
		app.use(async (c, next) => {
			c.set('chainRegistry', registry)
			await next()
		})
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

	it('leaves deployment metadata null when creatorTxHash is not provided', async () => {
		const chainId = staticChains[0].id
		const address = '0x1111111111111111111111111111111111111111' as const
		const runtimeBytecode = createVyperBytecode('6000')
		const creationBytecode = createVyperBytecode('60016000')
		const getCode = async () => runtimeBytecode
		mockCreatePublicClient.mockReturnValue({
			getCode,
			getTransactionReceipt: vi.fn(),
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

		const app = new Hono<AppEnv>()
		const registry2 = ChainRegistry.fromStatic(staticChains)
		app.use(async (c, next) => {
			c.set('chainRegistry', registry2)
			await next()
		})
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
				}),
			},
			env,
		)

		expect(response.status).toBe(200)

		const db = drizzle(env.CONTRACTS_DB)
		const deployments = await db.select().from(DB.contractDeploymentsTable)

		expect(deployments).toHaveLength(1)
		expect(deployments[0]?.transactionHash).toBeNull()
		expect(deployments[0]?.blockNumber).toBeNull()
		expect(deployments[0]?.transactionIndex).toBeNull()
		expect(deployments[0]?.deployer).toBeNull()
	})
})
