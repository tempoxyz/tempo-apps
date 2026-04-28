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
					decimals: 6,
					symbol: 'PathUSD',
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
})
