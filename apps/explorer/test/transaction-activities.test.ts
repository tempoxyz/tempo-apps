import { describe, expect, test } from 'vitest'
import { activitiesToKnownEvents } from '#lib/domain/transaction-activities'

describe('activitiesToKnownEvents', () => {
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
