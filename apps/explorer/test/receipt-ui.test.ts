import { describe, expect, test } from 'vitest'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events'
import {
	getReceiptDistinctSideAmount,
	getReceiptNotePresentation,
} from '#lib/domain/receipt-ui'

const token = '0x20c0000000000000000000000000000000000000'
const otherToken = '0x20c0000000000000000000000000000000000001'
const hash =
	'0x767f46ba330cad90c74a38f5a1342f648f612c68886a8ec8d9ac456d3140c7fe'
const amount = {
	token,
	value: 100_000_000n,
	decimals: 6,
	currency: 'USD',
	symbol: 'PathUSD',
}
const transfer: KnownEvent = {
	type: 'transfer',
	parts: [
		{ type: 'action', value: 'Token transferred' },
		{ type: 'amount', value: amount },
	],
}

describe('receipt details', () => {
	test('shows the reported 100 PathUSD transfer once without changing its source amount', () => {
		expect(getReceiptDistinctSideAmount(transfer)).toBeUndefined()
		expect(transfer.parts[1]).toEqual({ type: 'amount', value: amount })
		expect(
			getReceiptDistinctSideAmount({ ...transfer, totalAmount: { ...amount } }),
		).toBeUndefined()
	})

	test('keeps both swap quantities inline and a distinct aggregate when supplied', () => {
		const swap: KnownEvent = {
			type: 'swap',
			parts: [
				...transfer.parts,
				{ type: 'text', value: 'for' },
				{
					type: 'amount',
					value: { ...amount, token: otherToken, value: 99_000_000n },
				},
			],
		}
		expect(getReceiptDistinctSideAmount(swap)).toBeUndefined()
		const aggregate = { ...amount, value: 200_000_000n }
		expect(
			getReceiptDistinctSideAmount({ ...transfer, totalAmount: aggregate }),
		).toEqual(aggregate)
	})

	test('preserves non-USD quantities and distinguishes token addresses rather than symbols', () => {
		const nonUsd = { ...amount, currency: 'EUR', symbol: 'EURO' }
		const event: KnownEvent = {
			type: 'send',
			parts: [{ type: 'amount', value: nonUsd }],
		}
		expect(getReceiptDistinctSideAmount(event)).toBeUndefined()
		const otherAmount = { ...nonUsd, token: otherToken }
		expect(
			getReceiptDistinctSideAmount({ ...event, totalAmount: otherAmount }),
		).toEqual(otherAmount)
		expect(event.parts[0]).toEqual({ type: 'amount', value: nonUsd })
	})

	test('retains the visibility rules for private Zone activities', () => {
		expect(
			getReceiptDistinctSideAmount({
				type: 'private-assets-deposited',
				parts: [{ type: 'action', value: 'Private Zone Deposit' }],
				totalAmount: amount,
			}),
		).toBeUndefined()
	})

	test('identifies exact block and transaction destinations for the reported receipt', () => {
		expect(
			getReceiptNotePresentation('Block Number', {
				type: 'number',
				value: 10202719,
			}),
		).toEqual({ kind: 'block', label: 'Block', id: '10202719' })
		expect(
			getReceiptNotePresentation('Transaction Hash', {
				type: 'hex',
				value: hash,
			}),
		).toEqual({ kind: 'transaction', label: 'Transaction', hash })
	})

	test('converts an ISO timestamp to an instant for the browser’s local-time formatter', () => {
		const value = '2026-03-27T12:06:10.000Z'
		expect(
			getReceiptNotePresentation('Timestamp', { type: 'text', value }),
		).toEqual({
			kind: 'time',
			label: 'Local time',
			timestamp: BigInt(Date.parse(value) / 1000),
			iso: value,
		})
		expect(
			getReceiptNotePresentation('Timestamp', {
				type: 'text',
				value: '2026-03-27T08:06:10-04:00',
			}),
		).toEqual(getReceiptNotePresentation('Timestamp', { type: 'text', value }))
	})

	test('uses plain transfer wording for both directions', () => {
		expect(
			getReceiptNotePresentation('Direction', { type: 'text', value: 'out' }),
		).toEqual({
			kind: 'part',
			label: 'Transfer',
			part: { type: 'text', value: 'Sent' },
		})
		expect(
			getReceiptNotePresentation('Direction', { type: 'text', value: 'in' }),
		).toEqual({
			kind: 'part',
			label: 'Transfer',
			part: { type: 'text', value: 'Received' },
		})
	})

	test('leaves invalid, ambiguous, and unrelated metadata intact', () => {
		const examples: [string, KnownEventPart][] = [
			['Timestamp', { type: 'text', value: 'unknown' }],
			['Timestamp', { type: 'text', value: '2026-03-27T12:06:10' }],
			['Block Number', { type: 'number', value: -1 }],
			['Transaction Hash', { type: 'hex', value: '0x1234' }],
			['Hash', { type: 'hex', value: hash }],
			['Direction', { type: 'text', value: 'self' }],
			['Memo', { type: 'text', value: 'out' }],
		]
		for (const [label, part] of examples)
			expect(getReceiptNotePresentation(label, part)).toEqual({
				kind: 'part',
				label,
				part,
			})
	})
})
