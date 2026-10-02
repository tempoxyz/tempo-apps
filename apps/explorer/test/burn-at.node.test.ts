import { describe, expect, it } from 'vitest'
import * as Address from 'ox/Address'
import {
	decodeFunctionData,
	encodeFunctionData,
	encodeAbiParameters,
	encodeEventTopics,
	parseAbi,
	zeroAddress,
} from 'viem'
import { Abis } from '#lib/abis'
import {
	accountAddress,
	getTokenMetadata,
	mockReceipt,
	mockLog,
	recipientAddress,
	userTokenAddress,
} from '#lib/demo'
import { parseKnownEvent, parseKnownEvents } from '#lib/domain/known-events'
import { selectTransactionDescriptionEvents } from '#lib/domain/transaction-activities'
import { groupRelatedEvents } from '#lib/domain/tx-event-groups'

const burnAtAbi = parseAbi([
	'event BurnAt(address indexed burner, address indexed from, uint256 indexed amount)',
])

function burnAtLog(amount = 1_000_000n, burner = accountAddress) {
	return mockLog({
		address: userTokenAddress,
		topics: encodeEventTopics({
			abi: burnAtAbi,
			eventName: 'BurnAt',
			args: { burner, from: recipientAddress, amount },
		}),
	})
}

function transferLog(
	amount = 1_000_000n,
	address = userTokenAddress,
	from = recipientAddress,
) {
	return mockLog({
		address,
		topics: encodeEventTopics({
			abi: Abis.tip20,
			eventName: 'Transfer',
			args: { from, to: zeroAddress },
		}),
		data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
	})
}

describe('BurnAt', () => {
	it('decodes burnAt calldata with the Explorer ABI', () => {
		const data = encodeFunctionData({
			abi: Abis.tip20,
			functionName: 'burnAt',
			args: [recipientAddress, 1_000_000n],
		})
		expect(decodeFunctionData({ abi: Abis.tip20, data })).toEqual({
			functionName: 'burnAt',
			args: [recipientAddress, 1_000_000n],
		})
	})

	it('uses the ordinary burn presentation with the actual burner', () => {
		const event = parseKnownEvent(burnAtLog(), { getTokenMetadata })
		expect(event).toEqual({
			type: 'burn at',
			parts: [
				{ type: 'action', value: 'Burn' },
				{
					type: 'amount',
					value: {
						token: userTokenAddress,
						value: 1_000_000n,
						currency: 'USD',
						decimals: 6,
						symbol: 'USDC',
					},
				},
				{ type: 'text', value: 'from' },
				{ type: 'account', value: recipientAddress },
			],
			note: [
				[
					'Burner',
					{ type: 'account', value: Address.checksum(accountAddress) },
				],
			],
		})
	})

	it('shows one burn for the paired Transfer and BurnAt', () => {
		const events = parseKnownEvents(
			mockReceipt([transferLog(), burnAtLog()], accountAddress),
		)
		expect(events.map((event) => event.type)).toEqual(['burn at'])
	})

	it('hides the burner note when it duplicates the transaction sender', () => {
		const events = parseKnownEvents(
			mockReceipt([transferLog(), burnAtLog()], accountAddress),
		)
		expect(events[0]?.note).toBeUndefined()
	})

	it('hides the duplicate burner note for individual logs regardless of address casing', () => {
		const event = parseKnownEvent(burnAtLog(), {
			transactionSender: Address.checksum(accountAddress),
		})
		expect(event?.type).toBe('burn at')
		expect(event?.note).toBeUndefined()
	})

	it('keeps the bridge burner note for individual logs', () => {
		const event = parseKnownEvent(burnAtLog(1_000_000n, userTokenAddress), {
			transactionSender: accountAddress,
		})
		expect(event?.note).toEqual([
			[
				'Burner',
				{ type: 'account', value: Address.checksum(userTokenAddress) },
			],
		])
	})

	it('groups the paired logs under the burn in the Events tab', () => {
		const logs = [transferLog(), burnAtLog()]
		const knownEvents = logs.map((log) => parseKnownEvent(log))
		expect(groupRelatedEvents(logs, knownEvents)).toEqual([
			{ logs, startIndex: 0, knownEvent: knownEvents[1] },
		])
	})

	it('does not group an unrelated transfer with BurnAt in the Events tab', () => {
		const logs = [transferLog(2n), burnAtLog()]
		const knownEvents = logs.map((log) => parseKnownEvent(log))
		expect(groupRelatedEvents(logs, knownEvents)).toEqual([
			{ logs: [logs[0]], startIndex: 0, knownEvent: knownEvents[0] },
			{ logs: [logs[1]], startIndex: 1, knownEvent: knownEvents[1] },
		])
	})

	it('keeps the bridge burner distinct from the transaction sender', () => {
		const events = parseKnownEvents(
			mockReceipt(
				[transferLog(), burnAtLog(1_000_000n, userTokenAddress)],
				accountAddress,
			),
		)
		expect(events[0]?.note).toEqual([
			[
				'Burner',
				{ type: 'account', value: Address.checksum(userTokenAddress) },
			],
		])
	})

	it('preserves repeated identical burns', () => {
		const events = parseKnownEvents(
			mockReceipt(
				[transferLog(), burnAtLog(), transferLog(), burnAtLog()],
				accountAddress,
			),
		)
		expect(events.map((event) => event.type)).toEqual(['burn at', 'burn at'])
	})

	it('does not hide unrelated transfers with a different amount, token, or holder', () => {
		const events = parseKnownEvents(
			mockReceipt(
				[
					transferLog(2n),
					transferLog(1_000_000n, accountAddress),
					transferLog(1_000_000n, userTokenAddress, accountAddress),
					transferLog(),
					burnAtLog(),
				],
				accountAddress,
			),
		)
		expect(events.map((event) => event.type)).toEqual([
			'send',
			'send',
			'send',
			'burn at',
		])
	})

	it('removes only one matching transfer per burn', () => {
		const events = parseKnownEvents(
			mockReceipt([transferLog(), transferLog(), burnAtLog()], accountAddress),
		)
		expect(events.map((event) => event.type)).toEqual(['send', 'burn at'])
	})

	it('handles zero-amount burns', () => {
		const events = parseKnownEvents(
			mockReceipt([transferLog(0n), burnAtLog(0n)], accountAddress),
		)
		expect(events.map((event) => event.type)).toEqual(['burn at'])
	})

	it('does not invent a burn for a reverted receipt without logs', () => {
		expect(
			parseKnownEvents({
				...mockReceipt([], accountAddress),
				status: 'reverted',
			}),
		).toEqual([])
	})

	it('preserves burner details when the indexer supplies a generic transfer', () => {
		const fallbackEvents = parseKnownEvents(
			mockReceipt(
				[transferLog(), burnAtLog(1_000_000n, userTokenAddress)],
				accountAddress,
			),
		)
		expect(
			selectTransactionDescriptionEvents({
				fallbackEvents,
				activityEvents: [
					{ type: 'transfer', parts: [{ type: 'action', value: 'Send' }] },
				],
			}),
		).toEqual(fallbackEvents)
	})
})
