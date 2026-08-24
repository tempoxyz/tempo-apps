import { describe, expect, test } from 'vitest'
import { activitiesToKnownEvents } from '#lib/domain/transaction-activities'

describe('activitiesToKnownEvents', () => {
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

	test.each([
		['private-assets-deposited', 'Private Zone Deposit'],
		['private-assets-redeemed', 'Private Zone Withdrawal'],
	])('simplifies %s', (type, action) => {
		expect(
			activitiesToKnownEvents([
				{
					id: 'activity-1',
					title: 'Low-level private activity',
					type,
					data: { actionId: `0x${'1'.repeat(64)}` },
				},
			]),
		).toEqual([{ type, parts: [{ type: 'action', value: action }] }])
	})
})
