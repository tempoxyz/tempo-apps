import { describe, expect, test } from 'vitest'
import type { KnownEvent } from '#lib/domain/known-events'
import { buildTxSummary } from '#lib/domain/tx-summary'

const event: KnownEvent = {
	type: 'swap',
	parts: [
		{ type: 'action', value: 'Swap' },
		{ type: 'text', value: 'for' },
	],
}

describe('transaction summary tense', () => {
	test('a successful action reads in the past tense', () => {
		const summary = buildTxSummary({
			receipt: { status: 'success' } as never,
			knownEvents: [event],
			trace: null,
		})
		expect(summary.headline).toBe('Swapped for.')
	})

	test('a reverted action keeps its plain verb', () => {
		const summary = buildTxSummary({
			receipt: { status: 'reverted' } as never,
			knownEvents: [event],
			trace: null,
		})
		expect(summary.headline.startsWith('Swap for failed')).toBe(true)
	})
})
