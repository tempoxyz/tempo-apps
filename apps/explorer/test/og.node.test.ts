import { describe, expect, test } from 'vitest'
import type { KnownEvent } from '#lib/domain/known-events'
import { selectTransactionDescriptionEvents } from '#lib/domain/transaction-activities'
import { buildOgImageUrl, formatEventForOgServer } from '#lib/og'

const hash =
	'0xd450f9268b6f14ccfea04dfbf57b67cc8a65ec30a3f0ffbaa19b6f70502a49c9'
const data = {
	block: { number: 36449187n, timestamp: 1787675820n },
	receipt: { from: '0xf0d4945f4d9996471bc4d2e7d0cff7a2f9eeb5a4' as const },
	feeBreakdown: [],
}
const amount = {
	value: 100_000n,
	decimals: 6,
	symbol: 'DLUSD',
	token: '0x20c0000000000000000000000000000000000001' as const,
}

function event(type: string, action: string): KnownEvent {
	return {
		type,
		parts: [
			{ type: 'action', value: action },
			{ type: 'amount', value: amount },
		],
	}
}

function cardEvents(events: KnownEvent[]) {
	return [...new URL(buildOgImageUrl(data, hash, events)).searchParams]
		.filter(([key]) => /^ev\d+$/.test(key))
		.map(([, value]) => value.split('|'))
}

describe('transaction social card actions', () => {
	test('uses interpreted actions in order instead of underlying transfers and nonce', () => {
		const actions = [
			event('private-shares-redeemed', 'Private Zone Withdrawal'),
			event('vault-deposit', 'Earn Deposit'),
			event('private-assets-deposited', 'Private Zone Deposit'),
		]
		const selected = selectTransactionDescriptionEvents({
			activityEvents: actions,
			fallbackEvents: [
				event('nonce', 'Increment Nonce'),
				event('send', 'Send'),
				event('approval', 'Approve'),
			],
			knownCall: null,
		})

		expect(cardEvents(selected).map(([action]) => action)).toEqual([
			'Private Zone Withdrawal',
			'Earn Deposit',
			'Private Zone Deposit',
		])
		expect(cardEvents(selected)[0]?.[2]).toBe('')
		expect(cardEvents(selected)[2]?.[2]).toBe('')
		for (const [index, action] of selected.entries()) {
			expect(cardEvents(selected)[index]?.slice(0, 3).join('|')).toBe(
				formatEventForOgServer(action),
			)
		}
	})

	test('keeps a decoded call when indexed activities only contain a nonce', () => {
		const selected = selectTransactionDescriptionEvents({
			activityEvents: [event('nonce incremented', 'Nonce Incremented')],
			fallbackEvents: [],
			knownCall: event('zone batch submission', 'Submit Zone Batch'),
		})
		expect(cardEvents(selected).map(([action]) => action)).toEqual([
			'Submit Zone Batch',
		])
	})

	test('retains decoded fallback actions when indexed activities are unavailable', () => {
		const selected = selectTransactionDescriptionEvents({
			activityEvents: [],
			fallbackEvents: [event('send', 'Send')],
			knownCall: null,
		})
		expect(cardEvents(selected)[0]).toEqual(['Send', '0.10 DLUSD', '$0.10', ''])
	})

	test('keeps numeric and hex details from interpreted actions', () => {
		const action: KnownEvent = {
			type: 'zone batch submission',
			parts: [
				{ type: 'action', value: 'Submit Zone Batch' },
				{ type: 'text', value: 'zone' },
				{ type: 'number', value: 7n },
				{ type: 'hex', value: hash },
			],
		}
		expect(cardEvents([action])[0]?.[1]).toContain('zone 7 0xd450')
	})

	test('handles empty actions and caps the selected actions sent to the card', () => {
		expect(cardEvents([])).toEqual([])
		expect(
			cardEvents(Array.from({ length: 7 }, () => event('send', 'Send'))),
		).toHaveLength(5)
	})
})
