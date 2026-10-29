import { describe, expect, test } from 'vitest'
import { pastTenseAction, toPastTenseEvent } from '#lib/domain/action-label'
import type { KnownEvent } from '#lib/domain/known-events'

describe('pastTenseAction', () => {
	test.each([
		['Send', 'Sent'],
		['Transfer', 'Transferred'],
		['Swap', 'Swapped'],
		['Deposit to Earn', 'Deposited to Earn'],
		['Withdraw from Earn', 'Withdrew from Earn'],
		['Mint', 'Minted'],
		['Burn', 'Burned'],
		['Admin Burn', 'Burned by Admin'],
		['Approve', 'Approved'],
		['Update Supply Cap', 'Updated Supply Cap'],
		['Open MPP Session', 'Opened MPP Session'],
		['Limit Buy', 'Placed Limit Buy'],
		['Encrypted Deposit to Zone E', 'Deposited to Zone E (Encrypted)'],
		['Send (failed)', 'Send Failed'],
		['Send Blocked', 'Send Blocked'],
		// Already past tense or a noun: unchanged.
		['Sent', 'Sent'],
		['Received', 'Received'],
		['MPP Payment', 'MPP Payment'],
		['Nonce Incremented', 'Nonce Incremented'],
	])('%s -> %s', (value, expected) => {
		expect(pastTenseAction(value)).toBe(expected)
	})
})

describe('toPastTenseEvent', () => {
	test.each([
		['Requested', 'Requested Earn Withdrawal'],
		['Cancelled', 'Cancelled Earn Withdrawal'],
		['Completed', 'Withdrew from Earn'],
	])('does not claim a %s Earn withdrawal finished', (status, label) => {
		const event: KnownEvent = {
			type: 'earn async redemption',
			parts: [
				{ type: 'action', value: 'Withdraw from Earn' },
				{ type: 'action', value: status },
				{ type: 'text', value: 'for' },
			],
		}
		expect(toPastTenseEvent(event).parts).toEqual([
			{ type: 'action', value: label },
			{ type: 'text', value: 'for' },
		])
	})

	test('says an order flipped rather than placed', () => {
		expect(
			toPastTenseEvent({
				type: 'order flipped',
				parts: [{ type: 'action', value: 'Flip Sell' }],
			}).parts,
		).toEqual([{ type: 'action', value: 'Flipped to Sell' }])
	})
})

describe('neutral transfers', () => {
	const from = '0x0000000000000000000000000000000000000001'
	const to = '0x0000000000000000000000000000000000000002'
	const amount = {
		token: '0x20c0000000000000000000000000000000000001',
		value: 10_000_000n,
	} as const

	test.each([
		['Send', ['Transferred', 'Payment']],
		['Transfer', ['Transferred']],
	] as const)('%s names both sides and tags only a proven payment', (action, tags) => {
		const event: KnownEvent = {
			type: action === 'Send' ? 'send' : 'transfer',
			parts: [
				{ type: 'action', value: action },
				{ type: 'amount', value: amount },
				{ type: 'text', value: 'to' },
				{ type: 'account', value: to },
			],
			meta: { from, to },
		}
		expect(toPastTenseEvent(event).parts).toEqual([
			...tags.map((value) => ({ type: 'action', value })),
			{ type: 'amount', value: amount },
			{ type: 'text', value: 'from' },
			{ type: 'account', value: from },
			{ type: 'text', value: 'to' },
			{ type: 'account', value: to },
		])
	})

	test('leaves failed, blocked and perspective labels alone', () => {
		for (const value of ['Send (failed)', 'Send Blocked', 'Sent', 'Received'])
			expect(
				toPastTenseEvent({
					type: 'send',
					parts: [{ type: 'action', value }],
					meta: { from, to },
				}).parts[0],
			).toEqual({ type: 'action', value: pastTenseAction(value) })
	})
})
