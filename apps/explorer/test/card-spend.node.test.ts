import { describe, expect, it } from 'vitest'
import { mockLog, mockReceipt } from '#lib/demo'
import { parseKnownEvents } from '#lib/domain/known-events'
import { getEventName } from '#lib/domain/tx-event-groups'
import {
	cardPrivateSpendFrom,
	cardPrivateSpendHash,
	cardPrivateSpendLogs,
} from './fixtures/card-private-spend'

const logs = cardPrivateSpendLogs.map((log) =>
	mockLog(
		{
			address: log.address,
			topics: [...log.topics] as never,
			data: log.data,
			logIndex: log.logIndex,
		},
		cardPrivateSpendHash,
	),
)

describe('private card spend from a Zone', () => {
	const events = parseKnownEvents(
		mockReceipt(logs, cardPrivateSpendFrom, cardPrivateSpendHash),
	)

	it('summarizes the spend instead of the hops through the router and program', () => {
		const text = events.map((event) =>
			event.parts
				.map((part) =>
					part.type === 'amount'
						? part.value.value.toString()
						: String(part.value),
				)
				.join(' '),
		)
		expect(text).toMatchInlineSnapshot(`
			[
			  "Increment Nonce 0x5B8BD9CB404e72192954d7c0240525c8cB6788e5",
			  "Card Spend 520000 to 0x39aaFFA434A319393c45BA1571bff602086E7808",
			  "Private Zone Deposit 10001",
			  "Private Zone Withdrawal 530001 to 0x59ec988b28108B64Dd5C94d7D9C6Da3f4feA134F",
			]
		`)
	})

	it('names the program and the change returned to the Zone', () => {
		const spend = events.find((event) => event.type === 'card private spend')
		expect(spend?.note).toMatchInlineSnapshot(`
			[
			  [
			    "Card program",
			    {
			      "type": "account",
			      "value": "0xBa9Df13aFE1aB5A79669A2fe484B68f3334Cb2f2",
			    },
			  ],
			  [
			    "Funding",
			    {
			      "type": "text",
			      "value": "Private (Zone)",
			    },
			  ],
			  [
			    "Change to Zone",
			    {
			      "type": "amount",
			      "value": {
			        "token": "0x20c0000000000000000000006a37DA5C996874BE",
			        "value": 10001n,
			      },
			    },
			  ],
			]
		`)
	})

	it('recognizes the Zone withdrawal event with its sender tag', () => {
		const withdrawal = logs.find(
			(log) =>
				log.topics[0] ===
				'0x65042ea6dad60c26f055e80ec401b3437c854ed586a0704d305bb4e9ea4518cf',
		)
		expect(withdrawal && getEventName(withdrawal)).toBe('WithdrawalProcessed')
	})
})
