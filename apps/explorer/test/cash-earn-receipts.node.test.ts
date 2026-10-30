import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { toPastTenseEvent } from '#lib/domain/action-label'
import { type KnownEvent, parseKnownEvents } from '#lib/domain/known-events'
import { selectTransactionDescriptionEvents } from '#lib/domain/transaction-activities'

/** Real mainnet receipts exported from explore.tempo.xyz/receipt/<hash>.json. */
function describeFixture(name: string, holder?: `0x${string}`): string[] {
	const json = JSON.parse(
		readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
		(_key, value) =>
			typeof value === 'string' && /^\d+#__bigint$/.test(value)
				? BigInt(value.split('#')[0])
				: value,
	)
	const receipt = {
		...json.receipt,
		logs: json.receipt.logs.map((log: Record<string, unknown>) => ({
			...log,
			logIndex: Number(log.logIndex),
		})),
	}
	return selectTransactionDescriptionEvents({
		activityEvents: [],
		fallbackEvents: parseKnownEvents(receipt, {
			transaction: json.transaction,
			holder,
		}),
		knownCall: null,
	})
		.map(toPastTenseEvent)
		.map((event: KnownEvent) =>
			event.parts
				.filter((part) => part.type === 'action')
				.map((part) => part.value)
				.join(' '),
		)
}

describe('Tempo Cash Earn receipts', () => {
	test('a card purchase funded from Earn reads as a card payment', () => {
		expect(describeFixture('cash-card-earn')).toEqual(['Card Payment'])
	})

	test('daily interest shows the holder their own share', () => {
		expect(
			describeFixture(
				'earn-reward-batches',
				'0x6ea2af3b1e68848291122dd512d5e952073147a0',
			),
		).toEqual(['Earned Interest'])
	})

	test('without a holder the receipt keeps the operator batches', () => {
		expect(describeFixture('earn-reward-batches')).toEqual([
			'Distributed Earn Rewards',
			'Distributed Earn Rewards',
		])
	})
})
