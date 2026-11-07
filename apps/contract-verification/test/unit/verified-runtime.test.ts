import { Hex } from 'ox'
import { describe, expect, it } from 'vitest'
import { restoreVerifiedRuntime } from '#lib/verified-runtime.ts'

describe('restoreVerifiedRuntime', () => {
	it('keeps an exact untransformed runtime', () => {
		expect(restore('0x60006000', null, null)).toBe('0x60006000')
	})
	it.each([
		'immutable',
		'library',
		'callProtection',
	] as const)('restores recorded %s bytes', (reason) => {
		const values =
			reason === 'callProtection'
				? { callProtection: '0x1234' }
				: {
						[reason === 'immutable' ? 'immutables' : 'libraries']: {
							recorded: '0x1234',
						},
					}
		expect(
			restore(
				'0x60000060',
				[{ type: 'replace', reason, offset: 1, id: 'recorded' }],
				values,
			),
		).toBe('0x60123460')
	})
	it('appends recorded Vyper immutable bytes', () => {
		expect(
			restore(
				'0x6000',
				[{ type: 'insert', reason: 'immutable', offset: 2, id: '1' }],
				{ immutables: { '1': '0xaabb' } },
			),
		).toBe('0x6000aabb')
	})
	it.each(
		[
			[{ type: 'replace', reason: 'immutable', offset: 1, id: 'absent' }],
			[{ type: 'replace', reason: 'immutable', offset: -1, id: '1' }],
			[{ type: 'replace', reason: 'immutable', offset: 10, id: '1' }],
			[{ type: 'replace', reason: 'cborAuxdata', offset: 1, id: '1' }],
			[{ type: 'insert', reason: 'library', offset: 4, id: '1' }],
			[{ type: 'insert', reason: 'immutable', offset: 1, id: '1' }],
			[
				{ type: 'replace', reason: 'immutable', offset: 1, id: '1' },
				{ type: 'replace', reason: 'immutable', offset: 2, id: '1' },
			],
		].map((transformations) => ({ transformations })),
	)('refuses unrepresentable or ambiguous recorded transformations %#', ({
		transformations,
	}) => {
		expect(
			restore('0x60000060', transformations, {
				immutables: { '1': '0x1234' },
				libraries: { '1': '0x1234' },
			}),
		).toBeNull()
	})
	it.each([
		'0x',
		'0x123',
		'0xzz',
		'1234',
	])('rejects malformed recorded value %s', (value) => {
		expect(
			restore(
				'0x60000060',
				[{ type: 'replace', reason: 'immutable', offset: 1, id: '1' }],
				{ immutables: { '1': value } },
			),
		).toBeNull()
	})
	it('rejects absent code and malformed serialized evidence', () => {
		expect(restore('0x', null, null)).toBeNull()
		expect(
			restoreVerifiedRuntime({
				code: Hex.toBytes('0x6000'),
				transformations: '{',
				values: null,
			}),
		).toBeNull()
		expect(
			restoreVerifiedRuntime({
				code: Hex.toBytes('0x6000'),
				transformations: null,
				values: '[]',
			}),
		).toBeNull()
	})
})
function restore(code: Hex.Hex, transformations: unknown, values: unknown) {
	return restoreVerifiedRuntime({
		code: Hex.toBytes(code),
		transformations:
			transformations === null ? null : JSON.stringify(transformations),
		values: values === null ? null : JSON.stringify(values),
	})
}
