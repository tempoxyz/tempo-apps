import { describe, expect, it } from 'vitest'
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
import { LineItems } from '#lib/domain/receipt'
import { selectTransactionDescriptionEvents } from '#lib/domain/transaction-activities'
import { groupRelatedEvents } from '#lib/domain/tx-event-groups'
import { HexFormatter } from '#lib/formatting'
import { renderReceiptText } from '#lib/domain/receipt-text'
import {
	burnAtCaller,
	burnAtHolder,
	burnAtReceipt,
	burnAtToken,
} from './fixtures/burn-at'

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

	it('labels BurnAt distinctly without a burner field', () => {
		const event = parseKnownEvent(burnAtLog(), { getTokenMetadata })
		expect(event).toEqual({
			type: 'burn at',
			parts: [
				{ type: 'action', value: 'BurnAt' },
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

	it('omits the burner note for individual logs without sender context', () => {
		const event = parseKnownEvent(burnAtLog())
		expect(event?.type).toBe('burn at')
		expect(event?.note).toBeUndefined()
	})

	it('omits the bridge burner note for individual logs', () => {
		const event = parseKnownEvent(burnAtLog(1_000_000n, userTokenAddress))
		expect(event?.type).toBe('burn at')
		expect(event?.note).toBeUndefined()
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

	it('omits the burner field even when the caller differs from the transaction sender', () => {
		const events = parseKnownEvents(
			mockReceipt(
				[transferLog(), burnAtLog(1_000_000n, userTokenAddress)],
				accountAddress,
			),
		)
		expect(events[0]?.type).toBe('burn at')
		expect(events[0]?.note).toBeUndefined()
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

	it('preserves the burn presentation when the indexer supplies a generic transfer', () => {
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

	it.each([
		0n,
		1_000_000n,
	])('exports one formatted BurnAt item for %s units', (amount) => {
		const items = LineItems.fromReceipt(
			mockReceipt([transferLog(amount), burnAtLog(amount)], accountAddress),
			{ getTokenMetadata },
		)
		expect(items.main).toHaveLength(1)
		expect(items.main[0]).toMatchObject({
			eventName: 'BurnAt',
			price: { amount, token: userTokenAddress, symbol: 'USDC', decimals: 6 },
			ui: {
				left: 'BurnAt USDC',
				bottom: [{ left: `From: ${HexFormatter.truncate(recipientAddress)}` }],
			},
		})
		expect(items.main[0].ui.right).not.toBe('-')
	})

	it('keeps repeated burns and an identical extra transfer in JSON line items', () => {
		const items = LineItems.fromReceipt(
			mockReceipt(
				[transferLog(), transferLog(), burnAtLog(), transferLog(), burnAtLog()],
				accountAddress,
			),
			{ getTokenMetadata },
		)
		expect(items.main.map((item) => item.event?.eventName)).toEqual([
			'Transfer',
			'BurnAt',
			'BurnAt',
		])
	})

	it('preserves JSON transfers with a different token, holder, or amount', () => {
		const items = LineItems.fromReceipt(
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
			{ getTokenMetadata },
		)
		expect(items.main.map((item) => item.event?.eventName)).toEqual([
			'Transfer',
			'Transfer',
			'Transfer',
			'BurnAt',
		])
	})

	it('keeps ordinary Burn labelled Burn alongside BurnAt', () => {
		const burn = mockLog({
			address: userTokenAddress,
			topics: encodeEventTopics({
				abi: Abis.tip20,
				eventName: 'Burn',
				args: { from: recipientAddress },
			}),
			data: encodeAbiParameters([{ type: 'uint256' }], [1_000_000n]),
		})
		const receipt = mockReceipt(
			[transferLog(), burn, transferLog(), burnAtLog()],
			accountAddress,
		)
		expect(
			parseKnownEvents(receipt).map((event) => event.parts[0].value),
		).toEqual(['Burn', 'BurnAt'])
		expect(
			LineItems.fromReceipt(receipt, { getTokenMetadata }).main.map(
				(item) => item.ui.left,
			),
		).toEqual(['Burn USDC', 'BurnAt USDC'])
	})

	it('renders the real Nextfork receipt consistently in descriptions, JSON, and text', () => {
		const metadata = (address: string) => ({
			currency: 'USD',
			decimals: 6,
			logoURI: '',
			symbol:
				address.toLowerCase() === burnAtToken.toLowerCase()
					? 'BATST'
					: 'pathUSD',
			name: 'BurnAt Explorer Test',
			totalSupply: 9_000_000n,
		})
		const events = parseKnownEvents(burnAtReceipt, {
			getTokenMetadata: metadata,
		})
		expect(burnAtCaller).not.toBe(burnAtHolder)
		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({
			type: 'burn at',
			parts: [
				{ type: 'action', value: 'BurnAt' },
				{ type: 'amount', value: { value: 1_000_000n, symbol: 'BATST' } },
				{ type: 'text', value: 'from' },
				{ type: 'account', value: burnAtHolder },
			],
		})
		expect(events[0].note).toBeUndefined()
		const items = LineItems.fromReceipt(burnAtReceipt, {
			getTokenMetadata: metadata,
		})
		expect(items.main).toHaveLength(1)
		expect(items.main[0]).toMatchObject({
			eventName: 'BurnAt',
			price: { amount: 1_000_000n, symbol: 'BATST' },
			ui: {
				left: 'BurnAt BATST',
				right: '$1',
				bottom: [{ left: `From: ${HexFormatter.truncate(burnAtHolder)}` }],
			},
		})
		const text = renderReceiptText(
			{ block: { timestamp: 0x6ac55fc4n }, receipt: burnAtReceipt },
			{ events, fee: 0, feeBreakdown: [], feeDisplay: '0' },
		)
		expect(text).toContain('1. BURNAT')
		expect(text).not.toContain('2. ')
		expect(text).not.toContain('BURNER')
	})
})
