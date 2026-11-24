import {
	type Address,
	encodeAbiParameters,
	encodeEventTopics,
	getAddress,
	zeroHash,
} from 'viem'
import { describe, expect, it } from 'vitest'
import { Abis } from '#lib/abis'
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

	it('uses the first router spend per program and leaves other routers’ transfers visible', () => {
		const spend = logs[6]
		const firstRouter = logs[10]
		const unusedRouter = '0x1111111111111111111111111111111111111111'
		const otherProgram = '0x2222222222222222222222222222222222222222'
		const token = logs[1].address
		const laterSpend = mockLog({
			...firstRouter,
			address: unusedRouter,
			data: encodeAbiParameters(
				[{ type: 'uint256' }, { type: 'uint256' }, { type: 'bytes32' }],
				[100n, 2n, zeroHash],
			),
		})
		const transfer = (from: Address) =>
			mockLog({
				address: token,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'Transfer',
					args: { from, to: cardPrivateSpendFrom },
				}),
				data: encodeAbiParameters([{ type: 'uint256' }], [1n]),
			})
		const result = parseKnownEvents(
			mockReceipt(
				[
					firstRouter,
					spend,
					laterSpend,
					{ ...spend, address: otherProgram },
					transfer(firstRouter.address),
					transfer(spend.address),
					transfer(unusedRouter),
				],
				cardPrivateSpendFrom,
			),
		)
		const spends = result.filter((event) => event.type === 'card private spend')
		expect(spends).toHaveLength(2)
		expect(spends[0].note).toContainEqual([
			'Change to Zone',
			{ type: 'amount', value: { token: getAddress(token), value: 10001n } },
		])
		expect(spends[1].note).toHaveLength(2)
		expect(
			result
				.filter((event) => event.type === 'send')
				.map((event) => event.meta?.from),
		).toEqual([unusedRouter])
	})

	it('hides the portal withdrawal hop only for the matching token and amount', () => {
		const hop = logs[1]
		const differentAmount = 17n
		const otherToken = '0x20c0000000000000000000000000000000000123'
		const result = parseKnownEvents(
			mockReceipt(
				[
					...logs,
					{
						...hop,
						data: encodeAbiParameters([{ type: 'uint256' }], [differentAmount]),
					},
					{ ...hop, address: otherToken },
				],
				cardPrivateSpendFrom,
			),
		)
		expect(
			result
				.filter((event) => event.type === 'send')
				.map(
					(event) => event.parts.find((part) => part.type === 'amount')?.value,
				),
		).toEqual([
			{ token: hop.address, value: differentAmount },
			{ token: otherToken, value: 530001n },
		])
	})
})
