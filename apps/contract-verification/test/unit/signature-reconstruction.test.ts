import { describe, expect, it } from 'vitest'
import { Hash, Hex } from 'ox'

import {
	buildSignaturesPayload,
	formatAbiParameterType,
} from '#route.lookup.ts'

describe('formatAbiParameterType', () => {
	it('returns primitive types unchanged', () => {
		expect(formatAbiParameterType({ type: 'uint256' })).toBe('uint256')
		expect(formatAbiParameterType({ type: 'address' })).toBe('address')
		expect(formatAbiParameterType({ type: 'bool' })).toBe('bool')
		expect(formatAbiParameterType({ type: 'bytes32' })).toBe('bytes32')
		expect(formatAbiParameterType({ type: 'string' })).toBe('string')
	})

	it('returns array types unchanged', () => {
		expect(formatAbiParameterType({ type: 'uint256[]' })).toBe('uint256[]')
		expect(formatAbiParameterType({ type: 'address[3]' })).toBe('address[3]')
	})

	it('reconstructs a flat tuple', () => {
		expect(
			formatAbiParameterType({
				type: 'tuple',
				components: [{ type: 'uint256' }, { type: 'address' }],
			}),
		).toBe('(uint256,address)')
	})

	it('reconstructs tuple[]', () => {
		expect(
			formatAbiParameterType({
				type: 'tuple[]',
				components: [{ type: 'uint256' }, { type: 'bool' }],
			}),
		).toBe('(uint256,bool)[]')
	})

	it('reconstructs tuple with fixed-size array suffix', () => {
		expect(
			formatAbiParameterType({
				type: 'tuple[5]',
				components: [{ type: 'address' }],
			}),
		).toBe('(address)[5]')
	})

	it('reconstructs nested tuple inside tuple', () => {
		expect(
			formatAbiParameterType({
				type: 'tuple',
				components: [
					{ type: 'address' },
					{
						type: 'tuple',
						components: [{ type: 'uint256' }, { type: 'bool' }],
					},
				],
			}),
		).toBe('(address,(uint256,bool))')
	})

	it('reconstructs nested tuple[] inside tuple', () => {
		expect(
			formatAbiParameterType({
				type: 'tuple',
				components: [
					{ type: 'bytes32' },
					{
						type: 'tuple[]',
						components: [{ type: 'address' }, { type: 'uint256' }],
					},
				],
			}),
		).toBe('(bytes32,(address,uint256)[])')
	})

	it('treats tuple with missing components as empty tuple', () => {
		expect(formatAbiParameterType({ type: 'tuple' })).toBe('()')
	})

	it('returns null for non-object input', () => {
		expect(formatAbiParameterType(null)).toBeNull()
		expect(formatAbiParameterType(undefined)).toBeNull()
		expect(formatAbiParameterType(42)).toBeNull()
		expect(formatAbiParameterType('uint256')).toBeNull()
	})

	it('returns null when type field is missing', () => {
		expect(formatAbiParameterType({ name: 'x' })).toBeNull()
	})

	it('filters out invalid components', () => {
		expect(
			formatAbiParameterType({
				type: 'tuple',
				components: [{ type: 'uint256' }, null, { type: 'bool' }],
			}),
		).toBe('(uint256,bool)')
	})
})

describe('buildSignaturesPayload', () => {
	function hash4(signature: string): string {
		const hash32 = Hash.keccak256(Hex.fromString(signature))
		return Hex.fromBytes(Hex.toBytes(hash32).slice(0, 4))
	}

	function hash32(signature: string): string {
		return Hash.keccak256(Hex.fromString(signature))
	}

	it('returns empty buckets for non-array input', () => {
		const result = buildSignaturesPayload(null)
		expect(result).toStrictEqual({ function: [], event: [], error: [] })
	})

	it('returns empty buckets for empty array', () => {
		const result = buildSignaturesPayload([])
		expect(result).toStrictEqual({ function: [], event: [], error: [] })
	})

	it('classifies function, event, and error', () => {
		const abi = [
			{
				type: 'function',
				name: 'transfer',
				inputs: [{ type: 'address' }, { type: 'uint256' }],
			},
			{
				type: 'event',
				name: 'Transfer',
				inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }],
			},
			{
				type: 'error',
				name: 'InsufficientBalance',
				inputs: [{ type: 'uint256' }, { type: 'uint256' }],
			},
		]

		const result = buildSignaturesPayload(abi)

		expect(result.function).toHaveLength(1)
		expect(result.event).toHaveLength(1)
		expect(result.error).toHaveLength(1)
		expect(result.function[0]?.signature).toBe('transfer(address,uint256)')
		expect(result.function[0]?.signatureHash4).toBe(
			hash4('transfer(address,uint256)'),
		)
		expect(result.function[0]?.signatureHash32).toBe(
			hash32('transfer(address,uint256)'),
		)
		expect(result.event[0]?.signature).toBe('Transfer(address,address,uint256)')
		expect(result.error[0]?.signature).toBe(
			'InsufficientBalance(uint256,uint256)',
		)
	})

	it('skips constructor, fallback, and receive entries', () => {
		const abi = [
			{ type: 'constructor', inputs: [{ type: 'uint256' }] },
			{ type: 'fallback' },
			{ type: 'receive' },
		]
		const result = buildSignaturesPayload(abi)
		expect(result.function).toHaveLength(0)
		expect(result.event).toHaveLength(0)
		expect(result.error).toHaveLength(0)
	})

	it('skips items without a name', () => {
		const abi = [{ type: 'function', inputs: [{ type: 'uint256' }] }]
		const result = buildSignaturesPayload(abi)
		expect(result.function).toHaveLength(0)
	})

	it('builds correct signature for tuple input', () => {
		const abi = [
			{
				type: 'function',
				name: 'doStuff',
				inputs: [
					{
						type: 'tuple',
						components: [{ type: 'address' }, { type: 'uint256' }],
					},
					{ type: 'bool' },
				],
			},
		]

		const result = buildSignaturesPayload(abi)
		expect(result.function[0]?.signature).toBe(
			'doStuff((address,uint256),bool)',
		)
		expect(result.function[0]?.signatureHash4).toBe(
			hash4('doStuff((address,uint256),bool)'),
		)
	})

	it('builds correct signature for tuple[] input', () => {
		const abi = [
			{
				type: 'function',
				name: 'batchTransfer',
				inputs: [
					{
						type: 'tuple[]',
						components: [{ type: 'address' }, { type: 'uint256' }],
					},
				],
			},
		]

		const result = buildSignaturesPayload(abi)
		expect(result.function[0]?.signature).toBe(
			'batchTransfer((address,uint256)[])',
		)
	})

	it('builds correct signature for nested tuple[] inside tuple', () => {
		const abi = [
			{
				type: 'function',
				name: 'complex',
				inputs: [
					{
						type: 'tuple',
						components: [
							{ type: 'bytes32' },
							{
								type: 'tuple[]',
								components: [{ type: 'address' }, { type: 'uint256' }],
							},
						],
					},
				],
			},
		]

		const result = buildSignaturesPayload(abi)
		expect(result.function[0]?.signature).toBe(
			'complex((bytes32,(address,uint256)[]))',
		)
		expect(result.function[0]?.signatureHash4).toBe(
			hash4('complex((bytes32,(address,uint256)[]))'),
		)
	})

	it('builds correct signature for deeply nested tuples', () => {
		const abi = [
			{
				type: 'event',
				name: 'Deep',
				inputs: [
					{
						type: 'tuple',
						components: [
							{
								type: 'tuple',
								components: [
									{
										type: 'tuple',
										components: [{ type: 'uint8' }],
									},
								],
							},
						],
					},
				],
			},
		]

		const result = buildSignaturesPayload(abi)
		expect(result.event[0]?.signature).toBe('Deep((((uint8))))')
	})

	it('builds correct signature for error with tuple input', () => {
		const abi = [
			{
				type: 'error',
				name: 'BadOrder',
				inputs: [
					{
						type: 'tuple',
						components: [
							{ type: 'address' },
							{ type: 'uint256' },
							{ type: 'bytes' },
						],
					},
				],
			},
		]

		const result = buildSignaturesPayload(abi)
		expect(result.error[0]?.signature).toBe('BadOrder((address,uint256,bytes))')
		expect(result.error[0]?.signatureHash32).toBe(
			hash32('BadOrder((address,uint256,bytes))'),
		)
	})

	it('handles function with no inputs', () => {
		const abi = [{ type: 'function', name: 'pause', inputs: [] }]
		const result = buildSignaturesPayload(abi)
		expect(result.function[0]?.signature).toBe('pause()')
	})

	it('handles function with missing inputs field', () => {
		const abi = [{ type: 'function', name: 'pause' }]
		const result = buildSignaturesPayload(abi)
		expect(result.function[0]?.signature).toBe('pause()')
	})
})
