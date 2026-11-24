import { parseAbi } from 'viem'
import { describe, expect, it } from 'vitest'
import {
	areWriteArgsFilled,
	getWriteFunctions,
	parseWriteArgs,
} from '#lib/domain/contracts'

describe('write function arguments', () => {
	it('keeps an argument named value apart from the native amount', () => {
		const [fn] = getWriteFunctions(
			parseAbi(['function deposit(uint256 value) payable']),
		)
		expect(fn?.inputs[0]?.name).toBe('value')
		// The native amount is not part of the arguments, so an empty argument
		// list stays unfilled even when an amount is entered elsewhere.
		expect(areWriteArgsFilled(fn?.inputs ?? [], [])).toBe(false)
		expect(parseWriteArgs(fn?.inputs ?? [], ['1000000000000000000'])).toEqual({
			args: [1000000000000000000n],
			error: null,
		})
	})

	it('keeps unnamed arguments in their own positions', () => {
		const inputs = [
			{ name: '', type: 'uint256' },
			{ name: '', type: 'uint256' },
		]
		expect(parseWriteArgs(inputs, ['1', '2'])).toEqual({
			args: [1n, 2n],
			error: null,
		})
	})

	it('keeps same-named arguments in their own positions', () => {
		const inputs = [
			{ name: 'to', type: 'address' },
			{ name: 'to', type: 'uint256' },
		]
		expect(
			parseWriteArgs(inputs, [
				'0x0000000000000000000000000000000000000001',
				'7',
			]),
		).toEqual({
			args: ['0x0000000000000000000000000000000000000001', 7n],
			error: null,
		})
	})

	it('accepts arguments that have no name', () => {
		const inputs = [{ type: 'uint256' }]
		expect(areWriteArgsFilled(inputs, ['1'])).toBe(true)
		expect(parseWriteArgs(inputs, ['1']).args).toEqual([1n])
	})

	it('waits until every argument is filled', () => {
		const inputs = [{ type: 'uint256' }, { type: 'uint256' }]
		expect(areWriteArgsFilled(inputs, ['1'])).toBe(false)
		expect(areWriteArgsFilled(inputs, ['1', ' '])).toBe(false)
		expect(parseWriteArgs(inputs, ['1'])).toEqual({ args: [], error: null })
	})

	it('reports arguments that do not parse', () => {
		const result = parseWriteArgs([{ type: 'uint256' }], ['abc'])
		expect(result.args).toEqual([])
		expect(result.error).toBeTruthy()
	})
})
