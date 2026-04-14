import { describe, expect, it } from 'vitest'
import type * as Hex from 'ox/Hex'
import { encodeAbiParameters, encodeEventTopics, zeroHash } from 'viem'
import { Abis } from 'viem/tempo'
import {
	accountAddress,
	mockLog,
	recipientAddress,
	userTokenAddress,
} from '#lib/demo'
import { groupRelatedEvents } from '#lib/domain/tx-event-groups'

const UNKNOWN_ZONE_PORTAL = `0x${'8'.repeat(40)}` as const

const depositMadeAbi = [
	{
		type: 'event',
		name: 'DepositMade',
		inputs: [
			{
				indexed: true,
				name: 'newCurrentDepositQueueHash',
				type: 'bytes32',
			},
			{ indexed: true, name: 'sender', type: 'address' },
			{ indexed: false, name: 'token', type: 'address' },
			{ indexed: false, name: 'to', type: 'address' },
			{ indexed: false, name: 'netAmount', type: 'uint128' },
			{ indexed: false, name: 'fee', type: 'uint128' },
			{ indexed: false, name: 'memo', type: 'bytes32' },
		],
		anonymous: false,
	},
] as const

const withdrawalProcessedAbi = [
	{
		type: 'event',
		name: 'WithdrawalProcessed',
		inputs: [
			{ indexed: true, name: 'to', type: 'address' },
			{ indexed: false, name: 'token', type: 'address' },
			{ indexed: false, name: 'amount', type: 'uint128' },
			{ indexed: false, name: 'callbackSuccess', type: 'bool' },
		],
		anonymous: false,
	},
] as const

describe('groupRelatedEvents', () => {
	it('groups Transfer + DepositMade into one tx event row', () => {
		const hash = `0x${'3'.repeat(64)}` as const
		const netAmount = 1_000_000n
		const fee = 25_000n
		const logs = [
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: accountAddress,
							to: UNKNOWN_ZONE_PORTAL,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [netAmount + fee]),
				},
				hash,
			),
			mockLog(
				{
					address: UNKNOWN_ZONE_PORTAL,
					topics: encodeEventTopics({
						abi: depositMadeAbi,
						eventName: 'DepositMade',
						args: {
							newCurrentDepositQueueHash: zeroHash,
							sender: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[
							{ type: 'address' },
							{ type: 'address' },
							{ type: 'uint128' },
							{ type: 'uint128' },
							{ type: 'bytes32' },
						],
						[userTokenAddress, recipientAddress, netAmount, fee, zeroHash],
					),
				},
				hash,
			),
		]

		const transferEvent = {
			type: 'zone deposit',
			parts: [{ type: 'action', value: 'Deposit to Zone' }],
		} as const
		const depositEvent = {
			type: 'zone deposit',
			parts: [
				{ type: 'action', value: 'Deposit to Zone' },
				{ type: 'text', value: 'for recipient' },
			],
		} as const

		const grouped = groupRelatedEvents(logs, [transferEvent, depositEvent])

		expect(grouped).toHaveLength(1)
		expect(grouped[0]?.logs).toHaveLength(2)
		expect(grouped[0]?.startIndex).toBe(0)
		expect(grouped[0]?.knownEvent).toBe(depositEvent)
	})

	it('groups Transfer + WithdrawalProcessed into one tx event row', () => {
		const hash = `0x${'4'.repeat(64)}` as const
		const amount = 1_000_000n
		const logs = [
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: UNKNOWN_ZONE_PORTAL,
							to: recipientAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			),
			mockLog(
				{
					address: UNKNOWN_ZONE_PORTAL,
					topics: encodeEventTopics({
						abi: withdrawalProcessedAbi,
						eventName: 'WithdrawalProcessed',
						args: {
							to: recipientAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[{ type: 'address' }, { type: 'uint128' }, { type: 'bool' }],
						[userTokenAddress, amount, true],
					),
				},
				hash,
			),
		]

		const transferEvent = {
			type: 'zone withdrawal',
			parts: [{ type: 'action', value: 'Withdraw from Zone' }],
		} as const
		const withdrawalEvent = {
			type: 'zone withdrawal',
			parts: [
				{ type: 'action', value: 'Withdraw from Zone' },
				{ type: 'text', value: 'to recipient' },
			],
		} as const

		const grouped = groupRelatedEvents(logs, [transferEvent, withdrawalEvent])

		expect(grouped).toHaveLength(1)
		expect(grouped[0]?.logs).toHaveLength(2)
		expect(grouped[0]?.startIndex).toBe(0)
		expect(grouped[0]?.knownEvent).toBe(withdrawalEvent)
	})
})
