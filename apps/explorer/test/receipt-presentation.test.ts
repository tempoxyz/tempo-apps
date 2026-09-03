import { describe, expect, test } from 'vitest'
import type { KnownEvent } from '#lib/domain/known-events'
import {
	buildReceiptPresentation,
	enrichReceiptEventAmounts,
	getReceiptEventSideAmount,
} from '#lib/domain/receipt-presentation'

const sender = '0x0000000000000000000000000000000000000001'
const other = '0x0000000000000000000000000000000000000002'
const token = '0x20c0000000000000000000000000000000000000'
const guard = '0xB10C000000000000000000000000000000000000'

const receipt = {
	effectiveGasPrice: 1n,
	from: sender,
	gasUsed: 1n,
} as const

const lineItems = {
	feeTotals: [
		{
			price: { amount: 1n, currency: 'USD', decimals: 6, token },
			ui: { left: 'Fee', right: '<$0.01' },
		},
	],
	totals: [
		{
			price: { amount: 1_000_001n, currency: 'USD', decimals: 6, token },
			ui: { left: 'Total', right: '$1' },
		},
	],
}

function build(events: KnownEvent[], voucher = null) {
	return buildReceiptPresentation({
		chainId: 4217,
		feeBreakdown: [
			{
				amount: 1n,
				currency: 'USD',
				decimals: 6,
				payer: sender,
				symbol: 'pathUSD',
				token,
			},
			{
				amount: 2n,
				currency: 'USD',
				decimals: 6,
				payer: other,
				symbol: 'pathUSD',
				token,
			},
		],
		feeToken: token,
		isTokenListed: () => true,
		knownEvents: events,
		lineItems,
		receipt,
		voucher,
	})
}

describe('receipt presentation', () => {
	test('hydrates missing amount metadata for every output format', () => {
		const [event] = enrichReceiptEventAmounts(
			[
				{
					type: 'send',
					parts: [
						{
							type: 'amount',
							value: { token, value: 250_120n },
						},
					],
					totalAmount: { token, value: 250_120n },
				},
			],
			() => ({ currency: 'USD', decimals: 6, symbol: 'pathUSD' }),
		)

		expect(event?.parts[0]).toMatchObject({
			type: 'amount',
			value: { currency: 'USD', decimals: 6, symbol: 'pathUSD' },
		})
		expect(event?.totalAmount).toMatchObject({
			currency: 'USD',
			decimals: 6,
			symbol: 'pathUSD',
		})
	})

	test('shares hidden-event, blocked-transfer, fee-payer, and voucher rules', () => {
		const presentation = build(
			[
				{
					type: 'nonce incremented',
					parts: [{ type: 'action', value: 'Nonce Incremented' }],
				},
				{
					type: 'active key count changed',
					parts: [{ type: 'action', value: 'Active Key Count Changed' }],
				},
				{
					type: 'send',
					parts: [{ type: 'action', value: 'Send' }],
					meta: { to: guard },
				},
				{
					type: 'transfer blocked',
					parts: [{ type: 'action', value: 'Transfer Blocked' }],
				},
			],
			{ packetCount: 3, packetSize: 2 },
		)

		expect(presentation.events.map((event) => event.type)).toEqual([
			'streamed payment',
			'transfer blocked',
		])
		expect(presentation.feeBreakdown).toHaveLength(1)
		expect(presentation.feeBreakdown[0]?.payer).toBe(sender)
		expect(presentation.totalDisplay).toBe('$6')
	})

	test('uses the same side-amount and vault-total rules as the card', () => {
		const first = { token, value: 1_000_000n, decimals: 6 }
		const second = { token, value: 2_000_000n, decimals: 6 }
		const redemption: KnownEvent = {
			type: 'earn private redemption',
			parts: [
				{ type: 'action', value: 'Earn Redemption' },
				{ type: 'amount', value: first },
				{ type: 'text', value: 'for' },
				{ type: 'amount', value: second },
			],
		}

		expect(getReceiptEventSideAmount(redemption)).toBeUndefined()
		expect(getReceiptEventSideAmount({ ...redemption, type: 'swap' })).toEqual(
			first,
		)
		expect(build([redemption]).totalDisplay).toBeUndefined()
		expect(
			build([redemption], { packetCount: 3, packetSize: 2 }).totalDisplay,
		).toBe('$6')
	})

	test('hides side amounts for private Zone activity', () => {
		const amount = { token, value: 5_000n, decimals: 6 }
		const privateDeposit: KnownEvent = {
			type: 'private-assets-deposited',
			parts: [
				{ type: 'action', value: 'Private Zone Deposit' },
				{ type: 'amount', value: amount },
			],
		}
		const privateWithdrawal: KnownEvent = {
			type: 'private-shares-redeemed',
			parts: [
				{ type: 'action', value: 'Private Zone Withdrawal' },
				{ type: 'amount', value: amount },
			],
			totalAmount: { ...amount, value: 10_000n },
		}
		const publicWithdrawal: KnownEvent = {
			...privateWithdrawal,
			parts: [
				{ type: 'action', value: 'Withdraw from Zone 1' },
				{ type: 'amount', value: amount },
			],
		}

		expect(getReceiptEventSideAmount(privateDeposit)).toBeUndefined()
		expect(getReceiptEventSideAmount(privateWithdrawal)).toBeUndefined()
		expect(getReceiptEventSideAmount(publicWithdrawal)).toEqual({
			...amount,
			value: 10_000n,
		})
	})

	test('derives regular totals from the same visible token flows', () => {
		const presentation = build([
			{
				type: 'send',
				parts: [
					{ type: 'action', value: 'Send' },
					{
						type: 'amount',
						value: {
							currency: 'USD',
							decimals: 6,
							token,
							value: 1_000_000n,
						},
					},
				],
				meta: { from: sender, to: other },
			},
		])

		expect(presentation.total).toBe(1.000001)
		expect(presentation.totalDisplay).toBe('$1')
	})
})
