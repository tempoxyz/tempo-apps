import { describe, expect, it } from 'vitest'
import { encodeErrorResult, type Log, parseAbi } from 'viem'
import {
	decodeTraceError,
	findDeepestFailurePath,
	formatDecodedTraceError,
} from '#lib/domain/trace-errors'
import {
	normalizeTempoBatchCall,
	withoutFeeTransferLogs,
} from '#lib/domain/tempo-calls'
import {
	normalizeSimulationResult,
	simulationQueryKey,
} from '#lib/queries/simulate'
import type { CallTrace } from '#lib/queries/trace'
import {
	parseExtraCalls,
	serializeExtraCalls,
} from '#lib/domain/simulate-calls'

const baseTrace = {
	type: 'CALL',
	from: '0x0000000000000000000000000000000000000001',
	to: '0x0000000000000000000000000000000000000002',
	gas: '0x10000',
	gasUsed: '0x100',
	input: '0x12345678',
} as const satisfies CallTrace

describe('simulation trace errors', () => {
	it('decodes a custom error with the frame ABI', () => {
		const abi = parseAbi([
			'error InsufficientBalance(uint256 available, uint256 required)',
		])
		const output = encodeErrorResult({
			abi,
			errorName: 'InsufficientBalance',
			args: [69_000n, 100_000n],
		})
		const decoded = decodeTraceError({
			trace: { ...baseTrace, output, error: 'execution reverted' },
			abi,
		})

		expect(decoded).toMatchObject({
			name: 'InsufficientBalance',
			args: [69_000n, 100_000n],
		})
		if (!decoded) throw new Error('Expected decoded error')
		expect(formatDecodedTraceError(decoded)).toBe(
			'InsufficientBalance(69000, 100000)',
		)
	})

	it('adds text for Solidity panic codes', () => {
		const abi = parseAbi(['error Panic(uint256)'])
		const output = encodeErrorResult({ abi, errorName: 'Panic', args: [0x11n] })
		const decoded = decodeTraceError({
			trace: { ...baseTrace, output, error: 'execution reverted' },
		})

		expect(decoded?.panicReason).toBe('arithmetic overflow or underflow')
	})

	it('finds the path to the deepest failing frame', () => {
		const trace: CallTrace = {
			...baseTrace,
			calls: [
				{ ...baseTrace, to: baseTrace.from },
				{
					...baseTrace,
					calls: [{ ...baseTrace, error: 'execution reverted', output: '0x' }],
				},
			],
		}
		expect(findDeepestFailurePath(trace)).toEqual([1, 0])
	})
})

describe('simulation query normalization', () => {
	const input = {
		chainId: 42431,
		from: baseTrace.from,
		to: baseTrace.to,
		data: baseTrace.input,
		value: '0',
		gas: '50000000',
		block: 'latest',
	} as const

	it('keys the cache by every call field and block', () => {
		expect(simulationQueryKey(input)).toEqual([
			'simulation',
			42431,
			'latest',
			baseTrace.from,
			baseTrace.to,
			baseTrace.input,
			'0',
			'50000000',
			// Batch calls participate in the key, so editing call 2 refetches.
			null,
		])
	})

	it('keeps independent tracer errors while using the execution result', () => {
		const result = normalizeSimulationResult(input, {
			trace: baseTrace,
			prestate: null,
			execution: {
				status: 'success',
				gasUsed: '0x123',
				returnData: '0x01',
				logs: [],
			},
			errors: { prestate: 'tracer unavailable' },
		})

		expect(result.status).toBe('success')
		expect(result.gasUsed).toBe(0x123n)
		expect(result.errors.prestate).toBe('tracer unavailable')
		expect(result.receipt.status).toBe('success')
	})
})

describe('Tempo batch calls', () => {
	it('reads calldata from the RPC input field', () => {
		expect(
			normalizeTempoBatchCall({
				to: baseTrace.to,
				input: baseTrace.input,
				value: '0x2a',
			}),
		).toEqual({ to: baseTrace.to, data: baseTrace.input, value: 42n })
	})

	it('excludes fee-manager transfers from replay comparisons', () => {
		const feeLog = {
			topics: [
				'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
				'0x000000000000000000000000b382a19bd91cdd760df167f7ea357910c7aaaef6',
				'0x000000000000000000000000feec000000000000000000000000000000000000',
			],
		} as unknown as Log
		expect(withoutFeeTransferLogs([feeLog])).toEqual([])
	})
})

describe('search parameter round-trips', () => {
	// The router JSON-parses search values, so a schema that only accepts the
	// serialized form rejects its own output and takes the whole route down.
	// This has bitten `gas` (parsed back as a number) and `calls` (parsed back
	// as an array); both crashed every shared link that carried them.
	it('round-trips extra calls through the value the router gives back', () => {
		const drafts = [
			{ to: '0xaaaa', data: '0xdead', value: '0' },
			{ to: '0xbbbb', data: '0xbeef', value: '7' },
			{ to: '0xcccc', data: '0x', value: '0' },
		]
		const serialized = serializeExtraCalls(drafts)
		expect(serialized).toEqual([
			['0xbbbb', '0xbeef', '7'],
			['0xcccc', '0x', '0'],
		])

		// The router hands back a parsed array, not the string we wrote.
		const roundTripped = parseExtraCalls(
			JSON.parse(JSON.stringify(serialized)) as string[][],
		)
		expect(roundTripped).toEqual(drafts.slice(1))
	})

	it('keeps a single call out of the extras parameter', () => {
		expect(
			serializeExtraCalls([{ to: '0xaaaa', data: '0x', value: '0' }]),
		).toBeUndefined()
		expect(parseExtraCalls(undefined)).toEqual([])
	})

	it('drops malformed entries rather than throwing', () => {
		expect(parseExtraCalls([[], ['0xaaaa']] as string[][])).toEqual([
			{ to: '0xaaaa', data: '0x', value: '0' },
		])
	})
})
