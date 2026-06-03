import { describe, expect, it } from 'vitest'
import type { KnownEvent } from '../src/lib/domain/known-events'
import { calculateKnownEventsTotal } from '../src/lib/domain/known-event-totals'

const senderAddress = `0x${'a'.repeat(40)}` as const
const forwardedAddress = `0x${'b'.repeat(40)}` as const
const recipientAddress = `0x${'c'.repeat(40)}` as const
const tokenAddress = `0x${'d'.repeat(40)}` as const

function sendEvent(params: {
	from: `0x${string}`
	to: `0x${string}`
	amount: bigint
	decimals?: number
}): KnownEvent {
	return {
		type: 'send',
		parts: [
			{ type: 'action', value: 'Send' },
			{
				type: 'amount',
				value: {
					token: tokenAddress,
					value: params.amount,
					decimals: params.decimals ?? 6,
					symbol: 'PathUSD',
				},
			},
			{ type: 'text', value: 'to' },
			{ type: 'account', value: params.to },
		],
		meta: { from: params.from, to: params.to },
	}
}

function sendEventWithoutMetadata(params: {
	from: `0x${string}`
	to: `0x${string}`
	amount: bigint
}): KnownEvent {
	return {
		type: 'send',
		parts: [
			{ type: 'action', value: 'Send' },
			{
				type: 'amount',
				value: {
					token: tokenAddress,
					value: params.amount,
				},
			},
			{ type: 'text', value: 'to' },
			{ type: 'account', value: params.to },
		],
		meta: { from: params.from, to: params.to },
	}
}

describe('calculateKnownEventsTotal', () => {
	it('uses max net outflow to avoid double-counting forwarded transfers', () => {
		const amount = 100_000_000n
		const events = [
			sendEvent({ from: senderAddress, to: forwardedAddress, amount }),
			sendEvent({ from: forwardedAddress, to: recipientAddress, amount }),
		]

		expect(calculateKnownEventsTotal(events)).toBe(100n * 10n ** 18n)
	})

	it('ignores approval events (which often use type(uint256).max)', () => {
		const amount = 100_000_000n
		const maxUint256 = 2n ** 256n - 1n
		const approval: KnownEvent = {
			type: 'approval',
			parts: [
				{ type: 'action', value: 'Approve' },
				{
					type: 'amount',
					value: {
						token: tokenAddress,
						value: maxUint256,
						decimals: 6,
						symbol: 'PathUSD',
					},
				},
				{ type: 'account', value: recipientAddress },
			],
		}
		const events = [
			approval,
			sendEvent({ from: senderAddress, to: recipientAddress, amount }),
		]

		expect(calculateKnownEventsTotal(events)).toBe(100n * 10n ** 18n)
	})

	it('defaults unknown-decimal transfer amounts to 18 decimals', () => {
		const oneThousand = 1_000n * 10n ** 18n
		const fiveHundredPointThree = 500_300_000_000_000_000_000n
		const events = [
			sendEventWithoutMetadata({
				from: senderAddress,
				to: forwardedAddress,
				amount: oneThousand,
			}),
			sendEventWithoutMetadata({
				from: senderAddress,
				to: recipientAddress,
				amount: fiveHundredPointThree,
			}),
		]

		expect(calculateKnownEventsTotal(events)).toBe(
			1_500_300_000_000_000_000_000n,
		)
	})
})
