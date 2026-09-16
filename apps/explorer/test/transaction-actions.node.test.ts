import { describe, expect, it } from 'vitest'
import {
	decodeFunctionData,
	encodeAbiParameters,
	encodeEventTopics,
	encodeFunctionData,
	maxUint256,
	parseAbi,
	parseAbiParameters,
	type TransactionReceipt,
	zeroHash,
} from 'viem'
import { zonePortalAbi } from '#lib/abis'
import {
	decodeKnownTransactionCalls,
	parseKnownEvents,
} from '#lib/domain/known-events'
import { selectTransactionDescriptionEvents } from '#lib/domain/transaction-activities'
import { zoneProverCall } from './fixtures/zone-prover-call'

type MinedLog = TransactionReceipt['logs'][number]

const batchAbi = parseAbi([
	'event BatchSubmitted(uint64 indexed withdrawalBatchIndex, uint256 indexed withdrawalQueueIndex, bytes32 nextProcessedDepositQueueHash, bytes32 nextBlockHash, bytes32 withdrawalQueueHash, uint64 lastProcessedDepositNumber, uint64 lastProcessedEnabledTokenCount)',
])
const decoded = decodeFunctionData({
	abi: zonePortalAbi,
	data: zoneProverCall.input,
})
if (decoded.functionName !== 'submitBatch' || decoded.args.length !== 10)
	throw new Error('Expected T13 fixture')
const batchArgs = decoded.args
const otherHash = `0x${'12'.repeat(32)}` as const
const otherPortal = '0x5ad0000000000000000000000000000000000003' as const

function batchLog(
	overrides: Partial<{
		portal: `0x${string}`
		nextBlockHash: `0x${string}`
		nextProcessedHash: `0x${string}`
		withdrawalQueueHash: `0x${string}`
		index: number
	}> = {},
): MinedLog {
	const withdrawalQueueHash = overrides.withdrawalQueueHash ?? batchArgs[5]
	return {
		address: overrides.portal ?? zoneProverCall.to,
		blockHash: zeroHash,
		blockNumber: 43439n,
		transactionHash: zeroHash,
		transactionIndex: 0,
		logIndex: overrides.index ?? 0,
		removed: false,
		topics: encodeEventTopics({
			abi: batchAbi,
			eventName: 'BatchSubmitted',
			args: {
				withdrawalBatchIndex: BigInt(311 + (overrides.index ?? 0)),
				withdrawalQueueIndex:
					withdrawalQueueHash === zeroHash ? maxUint256 : 5n,
			},
		}) as MinedLog['topics'],
		data: encodeAbiParameters(
			parseAbiParameters('bytes32, bytes32, bytes32, uint64, uint64'),
			[
				overrides.nextProcessedHash ?? batchArgs[3].nextProcessedHash,
				overrides.nextBlockHash ?? batchArgs[2].nextBlockHash,
				withdrawalQueueHash,
				batchArgs[3].nextDepositNumber,
				batchArgs[4].nextProcessedTokenCount,
			],
		),
	}
}

function receipt(
	logs: MinedLog[],
	status: TransactionReceipt['status'] = 'success',
) {
	return {
		from: otherPortal,
		to: zoneProverCall.to,
		blockHash: zeroHash,
		blockNumber: 43439n,
		contractAddress: null,
		cumulativeGasUsed: 0n,
		effectiveGasPrice: 0n,
		gasUsed: 0n,
		logsBloom: '0x',
		transactionIndex: 0,
		type: 'legacy',
		logs,
		status,
		transactionHash: zeroHash,
	} satisfies TransactionReceipt
}

function compose(
	logs: MinedLog[],
	transaction = zoneProverCall,
	status: TransactionReceipt['status'] = 'success',
) {
	return selectTransactionDescriptionEvents({
		activityEvents: [],
		fallbackEvents: parseKnownEvents(receipt(logs, status), { transaction }),
		knownCalls: decodeKnownTransactionCalls(transaction, status),
	})
}

describe('transaction action composition', () => {
	it('combines real T13 calldata with its matching log and interprets the no-queue sentinel', () => {
		const events = compose([batchLog()])
		expect(events).toHaveLength(1)
		expect(events[0].type).toBe('zone batch submitted')
		expect(events[0].note).toEqual(
			expect.arrayContaining([
				['Batch Index', { type: 'number', value: 311n }],
				['Tempo Block', { type: 'number', value: 43438n }],
				['Zone Height', { type: 'number', value: 35280n }],
				['Withdrawals', { type: 'text', value: 'None' }],
			]),
		)
		const labels = Array.isArray(events[0].note)
			? events[0].note.map(([label]) => label)
			: []
		expect(labels).not.toContain('Withdrawal Queue Index')
		expect(labels).not.toContain('Withdrawal Queue')
		expect(events[0].evidence?.map((source) => source.kind)).toEqual([
			'log',
			'call',
		])
	})

	it('retains calldata fallback without a log and log details without calldata', () => {
		expect(compose([])).toHaveLength(1)
		expect(compose([])[0].type).toBe('zone batch submission')
		const events = selectTransactionDescriptionEvents({
			activityEvents: [],
			fallbackEvents: parseKnownEvents(receipt([batchLog()])),
			knownCalls: [],
		})
		expect(events).toHaveLength(1)
		expect(events[0].type).toBe('zone batch submitted')
	})

	it.each([
		{ portal: otherPortal },
		{ nextBlockHash: otherHash },
		{ nextProcessedHash: otherHash },
		{ withdrawalQueueHash: otherHash },
	])('does not match a different batch identity: %j', (override) => {
		expect(compose([batchLog(override)])).toHaveLength(2)
	})

	it('preserves multiple submissions and does not decode the first Tempo call twice', () => {
		const args = [
			batchArgs[0],
			batchArgs[1],
			{ ...batchArgs[2], nextBlockHash: otherHash },
			batchArgs[3],
			batchArgs[4],
			batchArgs[5],
			batchArgs[6],
			batchArgs[7],
			batchArgs[8],
			batchArgs[9],
		] as const
		const second = {
			to: zoneProverCall.to,
			input: encodeFunctionData({
				abi: zonePortalAbi,
				functionName: 'submitBatch',
				args,
			}),
		}
		const transaction = { ...zoneProverCall, calls: [zoneProverCall, second] }
		const events = selectTransactionDescriptionEvents({
			activityEvents: [],
			fallbackEvents: parseKnownEvents(
				receipt([batchLog(), batchLog({ nextBlockHash: otherHash, index: 1 })]),
			),
			knownCalls: decodeKnownTransactionCalls(transaction, 'success'),
		})
		expect(events).toHaveLength(2)
		expect(
			events.map(
				(event) =>
					event.evidence?.find((source) => source.kind === 'call')?.index,
			),
		).toEqual([0, 1])
	})

	it('does not arbitrarily attribute calldata when matching logs are ambiguous', () => {
		const events = compose([batchLog(), batchLog({ index: 1 })])
		expect(
			events.filter((event) => event.type === 'zone batch submitted'),
		).toHaveLength(2)
		expect(events.every((event) => event.evidence?.length === 1)).toBe(true)
	})

	it('marks a reverted call as an attempted operation, not an executed event', () => {
		const [event] = compose([], zoneProverCall, 'reverted')
		expect(event.failed).toBe(true)
		expect(event.parts[0]).toEqual({
			type: 'action',
			value: 'Submit Zone Batch (failed)',
		})
		expect(event.evidence?.map((source) => source.kind)).toEqual(['call'])
	})

	it('uses one batch projection while retaining unrelated indexed actions', () => {
		const unrelated = { type: 'other action', parts: [] }
		const events = selectTransactionDescriptionEvents({
			activityEvents: [
				{ type: 'zone batch submission', parts: [] },
				{ type: 'nonce incremented', parts: [] },
				unrelated,
			],
			fallbackEvents: parseKnownEvents(receipt([batchLog()])),
			knownCalls: decodeKnownTransactionCalls(zoneProverCall, 'success'),
		})
		expect(events).toHaveLength(2)
		expect(events[0].type).toBe('zone batch submitted')
		expect(events[1]).toBe(unrelated)
	})

	it('retains a real withdrawal queue index when withdrawals are present', () => {
		const [event] = parseKnownEvents(
			receipt([batchLog({ withdrawalQueueHash: otherHash })]),
		)
		expect(event.note).toEqual(
			expect.arrayContaining([
				['Withdrawal Queue Index', { type: 'number', value: 5n }],
				['Withdrawal Queue', { type: 'hex', value: otherHash }],
			]),
		)
	})
})
