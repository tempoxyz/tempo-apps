import { describe, expect, it } from 'vitest'
import type * as Hex from 'ox/Hex'
import { encodeAbiParameters, encodeEventTopics, zeroHash } from 'viem'
import { Abis } from 'viem/tempo'
import {
	accountAddress,
	getTokenMetadata,
	mockLog,
	mockReceipt,
	recipientAddress,
	userTokenAddress,
} from '#lib/demo'
import { parseKnownEvents } from '#lib/domain/known-events'

const ZONE_5_PORTAL = '0x7069DeC4E64Fd07334A0933eDe836C17259c9B23' as const
const UNKNOWN_ZONE_PORTAL = `0x${'8'.repeat(40)}` as const

const bounceBackAbi = [
	{
		type: 'event',
		name: 'BounceBack',
		inputs: [
			{
				indexed: true,
				name: 'newCurrentDepositQueueHash',
				type: 'bytes32',
			},
			{ indexed: true, name: 'fallbackRecipient', type: 'address' },
			{ indexed: false, name: 'token', type: 'address' },
			{ indexed: false, name: 'amount', type: 'uint128' },
		],
		anonymous: false,
	},
] as const

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

describe('parseKnownEvents', () => {
	it('preserves tip20 approvals for zone portals', () => {
		const hash = `0x${'4'.repeat(64)}` as const
		const amount = 500_000n
		const logs = [
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Approval',
						args: {
							owner: accountAddress,
							spender: ZONE_5_PORTAL,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			),
		]

		const receipt = mockReceipt(logs, accountAddress, hash)
		const knownEvents = parseKnownEvents(receipt, { getTokenMetadata })

		expect(knownEvents).toHaveLength(1)
		expect(knownEvents[0]?.type).toBe('approval')
	})

	it('deduplicates bounce-back transfers against BounceBack events', () => {
		const hash = `0x${'2'.repeat(64)}` as const
		const amount = 1_000_000n
		const logs = [
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: ZONE_5_PORTAL,
							to: recipientAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			),
			mockLog(
				{
					address: ZONE_5_PORTAL,
					topics: encodeEventTopics({
						abi: bounceBackAbi,
						eventName: 'BounceBack',
						args: {
							newCurrentDepositQueueHash: zeroHash,
							fallbackRecipient: recipientAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[{ type: 'address' }, { type: 'uint128' }],
						[userTokenAddress, amount],
					),
				},
				hash,
			),
		]

		const receipt = mockReceipt(logs, accountAddress, hash)
		const knownEvents = parseKnownEvents(receipt, { getTokenMetadata })

		expect(knownEvents).toHaveLength(1)
		expect(knownEvents[0]?.type).toBe('zone bounce back')
	})

	it('deduplicates deposits for zone portals discovered from the current receipt', () => {
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

		const receipt = mockReceipt(logs, accountAddress, hash)
		const knownEvents = parseKnownEvents(receipt, { getTokenMetadata })

		expect(knownEvents).toHaveLength(1)
		expect(knownEvents[0]?.type).toBe('zone deposit')
	})
})
