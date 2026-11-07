import { Hex } from 'ox'
import { createPublicClient, http } from 'viem'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { createRpcTransport } from '#lib/rpc.ts'

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
	cumulativeGasUsed: 8_164_507n,
	status: 'success',
} as const
const creation = { type: 'CREATE', from: factory, to: address.toLowerCase() }
const call = { type: 'CALL', from: deployer, to: factory }
const runtime = '0x60ab600052'
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

	describe('stored runtime binding', () => {
		it.each([
			{ name: 'direct CREATE', contractAddress: address, type: 'CREATE' },
			{ name: 'factory CREATE', contractAddress: null, type: 'CREATE' },
			{ name: 'factory CREATE2', contractAddress: null, type: 'CREATE2' },
		])('binds $name to its traced runtime output', async ({
			contractAddress,
			type,
		}) => {
			const frame = { ...creation, type, output: '0x60AB600052' }
			const trace = contractAddress
				? { ...frame, from: deployer }
				: { ...call, calls: [frame] }
			expect(
				await metadata(
					{
						...traced(trace),
						getTransactionReceipt: async () => ({
							...receipt,
							contractAddress,
						}),
					},
					runtime,
				),
			).toEqual(expected)
		})

		it.each([
			undefined,
			null,
			42,
			{},
			'0x',
			'0x6000',
			'0x60ab60005',
			'0x60ag600052',
		])('rejects invalid or mismatched creation output %j', async (output) => {
			for (const contractAddress of [address, null]) {
				expect(
					await metadata(
						{
							...traced({ ...creation, from: deployer, output }),
							getTransactionReceipt: async () => ({
								...receipt,
								contractAddress,
							}),
						},
						runtime,
					),
				).toBeNull()
			}
		})

		it.each([
			'0x',
			'0x0',
			'0xzz',
			'not-hex',
			null,
		])('rejects invalid expected runtime %j before any RPC read', async (expectedRuntime) => {
			let reads = 0
			expect(
				await metadata(
					{
						getTransactionReceipt: async () => {
							reads++
							return receipt
						},
						transport: {
							request: async () => {
								reads++
								return { ...creation, output: expectedRuntime }
							},
						},
					},
					expectedRuntime as Hex.Hex,
				),
			).toBeNull()
			expect(reads).toBe(0)
		})

		it('never falls back to a direct receipt when tracing is unavailable', async () => {
			expect(await metadata({}, runtime)).toBeNull()
			expect(
				await metadata(
					{
						transport: {
							request: async () => {
								throw new Error('Method not supported')
							},
						},
					},
					runtime,
				),
			).toBeNull()
		})

		it('rejects a direct creation destroyed during its transaction', async () => {
			expect(
				await metadata(
					{
						...traced({
							...creation,
							from: deployer,
							output: runtime,
							calls: [{ type: 'SELFDESTRUCT', from: address, to: deployer }],
						}),
						getTransactionReceipt: async () => receipt,
					},
					runtime,
				),
			).toBeNull()
		})

		it('rejects multiple successful creations of the same target and runtime', async () => {
			expect(
				await metadata(
					traced({
						...call,
						calls: [
							{ ...creation, output: runtime },
							{ ...creation, type: 'CREATE2', output: runtime },
						],
					}),
					runtime,
				),
			).toBeNull()
		})

		it('ignores creations and destruction rolled back by an ancestor', async () => {
			expect(
				await metadata(
					traced({
						...call,
						calls: [
							{ ...creation, output: runtime },
							{
								...call,
								error: 'execution reverted',
								calls: [
									{ ...creation, output: '0x6000' },
									{ type: 'SELFDESTRUCT', from: address, to: deployer },
								],
							},
						],
					}),
					runtime,
				),
			).toEqual(expected)
		})

		it.each([
			null,
			{ type: 'SELFDESTRUCT', from: address, to: deployer },
		])('validates the complete trace after finding matching output (%j)', async (sibling) => {
			expect(
				await metadata(
					traced({
						...call,
						calls: [sibling, { ...creation, output: runtime }],
					}),
					runtime,
				),
			).toBeNull()
		})

		it.each([
			undefined,
			-1n,
			0n,
			50_000_001n,
		])('applies the cumulative replay budget to direct receipts (%s)', async (cumulativeGasUsed) => {
			let reads = 0
			expect(
				await metadata(
					{
						getTransactionReceipt: async () => ({
							...receipt,
							cumulativeGasUsed,
						}),
						transport: {
							request: async () => {
								reads++
								return { ...creation, output: runtime }
							},
						},
					},
					runtime,
				),
			).toBeNull()
			expect(reads).toBe(0)
		})

		it('accepts a runtime-bound direct creation at the replay budget', async () => {
			expect(
				await metadata(
					{
						...traced({ ...creation, from: deployer, output: runtime }),
						getTransactionReceipt: async () => ({
							...receipt,
							cumulativeGasUsed: 50_000_000n,
						}),
					},
					runtime,
				),
			).toEqual(expected)
		})

		it('retains the complete-trace frame budget with matching output', async () => {
			expect(
				await metadata(
					traced({
						...call,
						calls: [
							...Array(10_000).fill(call),
							{ ...creation, output: runtime },
						],
					}),
					runtime,
				),
			).toBeNull()
		})
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

	it.each([
		{ name: 'missing', gas: undefined },
		{ name: 'negative', gas: -1n },
		{ name: 'zero', gas: 0n },
		{ name: 'over budget', gas: 50_000_001n },
	])('refuses a $name cumulative replay budget before tracing', async ({
		gas,
	}) => {
		let reads = 0
		expect(
			await metadata({
				getTransactionReceipt: async () => ({
					...receipt,
					contractAddress: null,
					cumulativeGasUsed: gas,
				}),
				transport: {
					request: async () => {
						reads++
						return { ...call, calls: [creation] }
					},
				},
			}),
		).toBeNull()
		expect(reads).toBe(0)
	})

	it('accepts a factory proof at the cumulative replay budget', async () => {
		expect(
			await metadata({
				...traced({ ...call, calls: [creation] }),
				getTransactionReceipt: async () => ({
					...receipt,
					contractAddress: null,
					cumulativeGasUsed: 50_000_000n,
				}),
			}),
		).toEqual(expected)
	})

	it('does not require a trace replay budget for a direct creation', async () => {
		expect(
			await metadata({
				getTransactionReceipt: async () => ({
					...receipt,
					cumulativeGasUsed: undefined,
				}),
			}),
		).toEqual(expected)
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

describe('bounded creation proof', () => {
	afterEach(() => vi.unstubAllGlobals())

	it.each([
		{ extra: 0, accepted: true, expectedRuntime: undefined },
		{ extra: 1, accepted: false, expectedRuntime: undefined },
		{ extra: 0, accepted: true, expectedRuntime: runtime },
		{ extra: 1, accepted: false, expectedRuntime: runtime },
	] as const)('requires the complete trace to fit the byte budget ($extra excess bytes, runtime $expectedRuntime)', async ({
		extra,
		accepted,
		expectedRuntime,
	}) => {
		const result = expectedRuntime
			? { ...creation, from: deployer, output: expectedRuntime, input: '' }
			: { ...call, calls: [creation], input: '' }
		const envelope = { jsonrpc: '2.0', id: 1, result }
		result.input = '0'.repeat(
			256 * 1024 - JSON.stringify(envelope).length + extra,
		)
		const body = JSON.stringify(envelope)
		expect(new TextEncoder().encode(body).length).toBe(256 * 1024 + extra)
		vi.stubGlobal('fetch', async () => new Response(body))
		const client = createPublicClient({
			transport: createRpcTransport('https://rpc.example', 42431, {}),
		})
		const proof = await metadata(
			{
				getTransactionReceipt: async () => ({
					...receipt,
					contractAddress: expectedRuntime ? address : null,
				}),
				transport: client.transport,
			},
			expectedRuntime,
		)
		expect(proof).toEqual(accepted ? expected : null)
	})
})

function metadata(
	client: CreationTransactionClient = {},
	expectedRuntime?: Hex.Hex,
) {
	return getCreationTransactionMetadata({
		creationTransactionHash: hash,
		address,
		chainId: 42431,
		expectedRuntime,
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
					params: [
						hash,
						{
							tracer: 'callTracer',
							timeout: '3s',
							tracerConfig: { onlyTopCall: false, withLog: false },
						},
					],
				})
				return trace
			},
		},
	}
}
