import { Hex } from 'ox'
import { createPublicClient, http } from 'viem'
import { describe, expect, expectTypeOf, it } from 'vitest'

import {
	type CreationTransactionClient,
	getCreationTransactionMetadata,
} from '#lib/utilities.ts'

const hash =
	'0xf9cc5d01edcba591534a968e1583e54bbcdf4459c4b8db554acf846bb0635c0f'
const address = '0x0eb6bc4711Bf400684Df14616e049F4b889eb025'
const deployer = '0x20b0adf5bec8cd881cc1795a04c1f33888769132'
const factory = '0x749a947811764a14cd17fe3c7bcc5c470e2ac5cc'
const receipt = {
	transactionHash: hash,
	blockNumber: 39623884n,
	transactionIndex: 0,
	from: deployer,
	contractAddress: address,
	status: 'success',
} as const
const creation = { type: 'CREATE', from: factory, to: address.toLowerCase() }
const call = { type: 'CALL', from: deployer, to: factory }
const expected = {
	transactionHash: Hex.toBytes(hash),
	blockNumber: Number(receipt.blockNumber),
	transactionIndex: 0,
	deployer: Hex.toBytes(deployer),
}

describe('getCreationTransactionMetadata', () => {
	it('accepts the real viem public client without widening its RPC methods', () => {
		expectTypeOf(
			createPublicClient({ transport: http('https://rpc.example') }),
		).toExtend<CreationTransactionClient>()
	})

	it('accepts a successful direct creation without fetching a trace', async () => {
		expect(
			await metadata({
				transport: {
					request: async () => {
						throw new Error('Direct creations must not require a trace')
					},
				},
			}),
		).toEqual(expected)
	})

	it('compares receipt hashes and addresses without case sensitivity', async () => {
		expect(
			await metadata({
				getTransactionReceipt: async () => ({
					...receipt,
					contractAddress: address.toLowerCase(),
					transactionHash: `0x${hash.slice(2).toUpperCase()}`,
				}),
			}),
		).toEqual(expected)
	})

	it.each([
		'CREATE',
		'CREATE2',
	])('accepts a factory %s with a null receipt address', async (type) => {
		expect(
			await metadata(traced({ ...call, calls: [{ ...creation, type }] })),
		).toEqual(expected)
	})

	it('accepts the observed native Tempo factory trace shape and retains the transaction sender', async () => {
		// Read-only testnet trace of the recorded Earn deployment named by hash above, reduced to its creation frames.
		const trace = {
			...call,
			calls: [
				{
					type: 'STATICCALL',
					from: factory,
					to: '0x6bd462e528d7215e4b09e07b43b6a95cd59f3028',
				},
				creation,
				{
					type: 'CREATE2',
					from: factory,
					to: '0x3d3e6750b67003269404b08c3fdf7cd6f66b6760',
				},
			],
		}
		expect(await metadata(traced(trace))).toEqual(expected)
	})

	it('accepts a nested creation when another top-level contract was created', async () => {
		expect(
			await metadata({
				...traced({
					type: 'CREATE',
					from: deployer,
					to: factory,
					calls: [creation],
				}),
				getTransactionReceipt: async () => ({
					...receipt,
					contractAddress: factory,
				}),
			}),
		).toEqual(expected)
	})

	it('accepts a successful sibling of a reverted call', async () => {
		expect(
			await metadata(
				traced({
					...call,
					calls: [
						{ ...call, error: 'execution reverted', calls: [creation] },
						creation,
					],
				}),
			),
		).toEqual(expected)
	})

	it.each([
		'CREATE',
		'CREATE2',
	])('rejects a target that self-destructs during %s construction', async (type) => {
		expect(
			await metadata(
				traced({
					...call,
					calls: [
						{
							...creation,
							type,
							calls: [{ type: 'SELFDESTRUCT', from: address, to: deployer }],
						},
					],
				}),
			),
		).toBeNull()
	})

	it('rejects a created target destroyed by a later sibling call', async () => {
		expect(
			await metadata(
				traced({
					...call,
					calls: [
						{ ...creation, type: 'CREATE2' },
						{
							type: 'CALL',
							from: factory,
							to: address,
							calls: [
								{
									type: 'SELFDESTRUCT',
									from: address.toLowerCase(),
									to: deployer,
								},
							],
						},
					],
				}),
			),
		).toBeNull()
	})

	it('accepts a creation when target destruction is rolled back by an ancestor', async () => {
		expect(
			await metadata(
				traced({
					...call,
					calls: [
						creation,
						{
							...call,
							error: 'execution reverted',
							calls: [{ type: 'SELFDESTRUCT', from: address, to: deployer }],
						},
					],
				}),
			),
		).toEqual(expected)
	})

	it('accepts unrelated destruction even when the target is its beneficiary', async () => {
		expect(
			await metadata(
				traced({
					...call,
					calls: [
						creation,
						{ type: 'SELFDESTRUCT', from: factory, to: address },
					],
				}),
			),
		).toEqual(expected)
	})

	it.each([
		{ name: 'a reverted transaction', change: { status: 'reverted' as const } },
		{
			name: 'another transaction hash',
			change: { transactionHash: `0x${'ab'.repeat(32)}` as const },
		},
		{
			name: 'an unsafe block number',
			change: { blockNumber: BigInt(Number.MAX_SAFE_INTEGER) + 1n },
		},
		{ name: 'a negative block number', change: { blockNumber: -1n } },
		{ name: 'an invalid transaction index', change: { transactionIndex: -1 } },
		{
			name: 'a fractional transaction index',
			change: { transactionIndex: 0.5 },
		},
	])('rejects $name before requesting any trace', async ({ change }) => {
		let traceReads = 0
		expect(
			await metadata({
				getTransactionReceipt: async () => ({ ...receipt, ...change }),
				transport: {
					request: async () => {
						traceReads++
						return creation
					},
				},
			}),
		).toBeNull()
		expect(traceReads).toBe(0)
	})

	it.each([
		{ name: 'a CALL to an existing contract', trace: { ...call, to: address } },
		{ name: 'a no-op factory call', trace: { ...call, output: address } },
		{
			name: 'an event naming the target',
			trace: { ...call, logs: [{ address, topics: [hash] }] },
		},
		{
			name: 'a creation of another address',
			trace: { ...creation, to: factory },
		},
		{
			name: 'a failed creation',
			trace: { ...call, calls: [{ ...creation, error: 'execution reverted' }] },
		},
		{
			name: 'a failed ancestor',
			trace: { ...call, error: 'execution reverted', calls: [creation] },
		},
		{
			name: 'a caught reverted ancestor',
			trace: {
				...call,
				calls: [{ ...call, error: 'execution reverted', calls: [creation] }],
			},
		},
		{
			name: 'an ancestor revert reason',
			trace: { ...call, revertReason: 'failed', calls: [creation] },
		},
		{ name: 'a null trace', trace: null },
		{ name: 'an array instead of a callTracer frame', trace: [creation] },
		{
			name: 'an unrecognized frame type',
			trace: { ...call, type: 'LOG', calls: [creation] },
		},
		{
			name: 'a missing frame type',
			trace: { from: deployer, to: factory, calls: [creation] },
		},
		{ name: 'a malformed child', trace: { ...call, calls: [creation, null] } },
		{ name: 'a malformed call list', trace: { ...creation, calls: {} } },
		{ name: 'a malformed error', trace: { ...creation, error: null } },
		{
			name: 'a malformed target address',
			trace: { ...creation, to: '0x1234' },
		},
		{ name: 'a missing creator', trace: { type: 'CREATE', to: address } },
		{
			name: 'a missing ancestor target',
			trace: { type: 'CALL', from: deployer, calls: [creation] },
		},
	])('rejects $name', async ({ trace }) => {
		expect(await metadata(traced(trace))).toBeNull()
	})

	it('traverses deeply nested calls without recursion', async () => {
		let trace: unknown = creation
		for (let index = 0; index < 1_100; index++)
			trace = { ...call, calls: [trace] }
		expect(await metadata(traced(trace))).toEqual(expected)
	})

	it('rejects a trace exceeding the frame bound even if it includes a creation', async () => {
		expect(
			await metadata(
				traced({ ...call, calls: [...Array(10_000).fill(call), creation] }),
			),
		).toBeNull()
	})

	it('returns null when the receipt method is unavailable', async () => {
		expect(
			await getCreationTransactionMetadata({
				creationTransactionHash: hash,
				address,
				chainId: 42431,
				client: {},
			}),
		).toBeNull()
	})

	it('returns null when a factory trace is unavailable', async () => {
		expect(
			await metadata({
				getTransactionReceipt: async () => ({
					...receipt,
					contractAddress: null,
				}),
			}),
		).toBeNull()
		expect(
			await metadata({
				...traced(null),
				transport: {
					request: async () => {
						throw new Error('Method not supported')
					},
				},
			}),
		).toBeNull()
	})

	it('returns null when receipt lookup fails', async () => {
		expect(
			await metadata({
				getTransactionReceipt: async () => {
					throw new Error('Receipt unavailable')
				},
			}),
		).toBeNull()
	})

	it('rejects malformed supplied hashes before reading the receipt', async () => {
		let reads = 0
		expect(
			await getCreationTransactionMetadata({
				creationTransactionHash: '0x1234',
				address,
				chainId: 42431,
				client: {
					getTransactionReceipt: async () => {
						reads++
						return receipt
					},
				},
			}),
		).toBeNull()
		expect(reads).toBe(0)
	})
})

function metadata(client: CreationTransactionClient = {}) {
	return getCreationTransactionMetadata({
		creationTransactionHash: hash,
		address,
		chainId: 42431,
		client: { getTransactionReceipt: async () => receipt, ...client },
	})
}

function traced(trace: unknown): CreationTransactionClient {
	return {
		getTransactionReceipt: async () => ({ ...receipt, contractAddress: null }),
		transport: {
			request: async (args) => {
				expect(args).toEqual({
					method: 'debug_traceTransaction',
					params: [hash, { tracer: 'callTracer' }],
				})
				return trace
			},
		},
	}
}
