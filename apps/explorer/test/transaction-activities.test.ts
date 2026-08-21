import { describe, expect, test } from 'vitest'
import {
	activitiesToKnownEvents,
	selectTransactionDescriptionEvents,
} from '#lib/domain/transaction-activities'

describe('activitiesToKnownEvents', () => {
	test('omits unknown activities so local descriptions can be used', () => {
		expect(
			activitiesToKnownEvents([
				{ id: 'unknown', title: 'Unknown', type: 'unknown', data: {} },
			]),
		).toEqual([])
	})

	test('omits nonce activity when a decoded call is available', () => {
		const knownCall = {
			type: 'zone batch submission',
			parts: [{ type: 'action' as const, value: 'Submit Zone 3 Batch' }],
		}
		const activity = {
			type: 'nonce incremented',
			parts: [{ type: 'action' as const, value: 'Nonce Incremented' }],
		}

		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [activity],
				fallbackEvents: [],
				knownCall,
			}),
		).toEqual([knownCall])
	})

	test('preserves nonce activity when no decoded call is available', () => {
		const activity = {
			type: 'nonce incremented',
			parts: [{ type: 'action' as const, value: 'Nonce Incremented' }],
		}

		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [activity],
				fallbackEvents: [],
				knownCall: null,
			}),
		).toEqual([activity])
	})

	test('omits nonce activity when another indexed activity is available', () => {
		const batch = {
			type: 'zone batch submission',
			parts: [{ type: 'action' as const, value: 'Submit Zone 3 Batch' }],
		}
		const nonce = {
			type: 'nonce incremented',
			parts: [{ type: 'action' as const, value: 'Nonce Incremented' }],
		}

		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [batch, nonce],
				fallbackEvents: [],
				knownCall: null,
			}),
		).toEqual([batch])
	})

	test('preserves token amounts and perspective for transfers', () => {
		expect(
			activitiesToKnownEvents([
				{
					id: 'activity-1',
					title: 'Token transferred',
					type: 'transfer',
					data: {
						direction: 'in',
						sender: '0x0000000000000000000000000000000000000001',
						recipient: '0x0000000000000000000000000000000000000002',
						sourceAmount: {
							baseUnits: '1230000',
							currency: 'USD',
							decimals: 6,
							formatted: '1.23',
						},
						sourceToken: {
							address: '0x20c0000000000000000000000000000000000001',
							symbol: 'USD',
						},
					},
				},
			]),
		).toMatchObject([
			{
				type: 'transfer',
				meta: {
					from: '0x0000000000000000000000000000000000000001',
					to: '0x0000000000000000000000000000000000000002',
				},
				parts: [
					{ type: 'action', value: 'Token transferred' },
					{
						type: 'amount',
						value: {
							value: 1230000n,
							decimals: 6,
							symbol: 'USD',
						},
					},
					{ type: 'text', value: 'from' },
					{
						type: 'account',
						value: '0x0000000000000000000000000000000000000001',
					},
				],
			},
		])
	})

	test('maps an Earn activity into a receipt event', () => {
		expect(
			activitiesToKnownEvents([
				{
					id: 'activity-1',
					title: 'Shares redeemed',
					type: 'shares-redeemed',
					data: {
						assets: '49999',
						shares: '49999',
						status: 'completed',
						signer: 'self',
						vault: '0x10c063b3bbc396d7e4a0d4d48212d901e2943663',
					},
				},
			]),
		).toEqual([
			{
				type: 'shares-redeemed',
				parts: [{ type: 'action', value: 'Shares redeemed' }],
				note: [
					['Assets', { type: 'number', value: 49999n }],
					['Shares', { type: 'number', value: 49999n }],
					[
						'Vault',
						{
							type: 'account',
							value: '0x10c063b3bbc396d7e4a0d4d48212d901e2943663',
						},
					],
				],
			},
		])
	})
})
