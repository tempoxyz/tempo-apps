import { describe, expect, it } from 'vitest'
import { getPerspectiveEvent } from '../src/lib/domain/perspective-events'
import type { KnownEvent } from '../src/lib/domain/known-events'

const senderAddress = `0x${'a'.repeat(40)}` as const
const recipientAddress = `0x${'b'.repeat(40)}` as const
const tokenAddress = `0x${'c'.repeat(40)}` as const

const sendEvent: KnownEvent = {
	type: 'send',
	parts: [
		{ type: 'action', value: 'Send' },
		{
			type: 'amount',
			value: {
				token: tokenAddress,
				value: 100n,
				decimals: 6,
				symbol: 'USDC',
			},
		},
		{ type: 'text', value: 'to' },
		{ type: 'account', value: recipientAddress },
	],
	meta: { from: senderAddress, to: recipientAddress },
}

describe('getPerspectiveEvent', () => {
	it('labels outbound transfers as sent for the viewed address', () => {
		const event = getPerspectiveEvent(sendEvent, senderAddress)

		expect(event.parts[0]).toEqual({ type: 'action', value: 'Sent' })
	})

	it('labels inbound transfers as received for the viewed address', () => {
		const event = getPerspectiveEvent(sendEvent, recipientAddress)

		expect(event.parts[0]).toEqual({ type: 'action', value: 'Received' })
		expect(event.parts[2]).toEqual({ type: 'text', value: 'from' })
		expect(event.parts[3]).toEqual({ type: 'account', value: senderAddress })
	})
})
