import { describe, expect, it } from 'vitest'
import {
	boundCodeResult,
	boundedStringify,
	MAX_CODE_RESULT_CHARS,
	withBoundedResults,
} from './bounded-result.js'

describe('boundedStringify', () => {
	it.each([
		['string', 'hi "there"'],
		['number', 42],
		[
			'nested',
			{ a: [1, 'x', null, true, { b: [] }], c: {}, d: undefined, e: () => 1 },
		],
		['array holes', [undefined, () => 1, 3]],
		['dates', { at: new Date(0) }],
		['non-finite', [Number.NaN, Number.POSITIVE_INFINITY]],
	])('matches JSON.stringify for %s', (_, value) => {
		expect(boundedStringify(value, 10_000)).toEqual({
			text: JSON.stringify(value, null, 2),
			truncated: false,
		})
	})

	it('stops at the cap for a graph of shared references', () => {
		let node: unknown[] = ['x'.repeat(16)]
		for (let i = 0; i < 40; i++) node = [node, node]
		const start = performance.now()
		const { text, truncated } = boundedStringify(node, 1_000)
		expect(truncated).toBe(true)
		expect(text.length).toBe(1_000)
		expect(performance.now() - start).toBeLessThan(1_000)
	})

	it('stops at the cap for a cycle', () => {
		const cycle: Record<string, unknown> = { a: 1 }
		cycle.self = cycle
		expect(boundedStringify(cycle, 500).truncated).toBe(true)
	})
})

describe('withBoundedResults', () => {
	it('returns a bounded string for an oversized shared-reference result', async () => {
		let node: unknown[] = ['y']
		for (let i = 0; i < 30; i++) node = [node, node]
		const executor = withBoundedResults({
			execute: async () => ({ result: node }),
		})
		const { result } = await executor.execute('async () => {}', [])
		expect(typeof result).toBe('string')
		expect((result as string).length).toBeLessThanOrEqual(MAX_CODE_RESULT_CHARS)
		expect(result).toContain('--- TRUNCATED ---')
	})

	it('passes errors through and reports serialization failures as errors', async () => {
		const failing = withBoundedResults({
			execute: async () => ({ result: undefined, error: 'boom' }),
		})
		expect(await failing.execute('', [])).toEqual({
			result: undefined,
			error: 'boom',
		})
		const bigint = withBoundedResults({
			execute: async () => ({ result: { n: 1n } }),
		})
		expect((await bigint.execute('', [])).error).toContain('BigInt')
	})

	it('keeps strings within the cap and truncates longer ones', () => {
		expect(boundCodeResult('ok')).toBe('ok')
		const long = boundCodeResult('z'.repeat(MAX_CODE_RESULT_CHARS + 10))
		expect(long.length).toBe(MAX_CODE_RESULT_CHARS)
		expect(long).toContain('--- TRUNCATED ---')
	})
})
