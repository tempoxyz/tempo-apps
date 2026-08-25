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

	test('maps an Earn redemption into a Vault Withdrawal', () => {
		expect(
			activitiesToKnownEvents([
				{
					id: 'activity-1',
					title: 'Shares redeemed',
					type: 'shares-redeemed',
					data: {
						assets: '49999',
						shares: '49999',
						assetToken: '0x20c0000000000000000000000000000000000001',
						shareToken: '0x20c0000000000000000000000000000000000002',
						status: 'completed',
						signer: 'self',
						vault: '0x10c063b3bbc396d7e4a0d4d48212d901e2943663',
					},
				},
			]),
		).toEqual([
			{
				type: 'shares-redeemed',
				parts: [
					{ type: 'action', value: 'Vault Withdrawal' },
					{
						type: 'amount',
						value: {
							value: 49999n,
							token: '0x20c0000000000000000000000000000000000002',
						},
					},
					{ type: 'text', value: 'for' },
					{
						type: 'amount',
						value: {
							value: 49999n,
							token: '0x20c0000000000000000000000000000000000001',
						},
					},
				],
			},
		])
	})

	test.each([
		[
			'private-assets-deposited',
			'Private Zone Deposit',
			'shares',
			'shareToken',
		],
		[
			'private-shares-redeemed',
			'Private Zone Deposit',
			'outputAmount',
			'outputToken',
		],
	])('simplifies %s', (type, action, amountKey, tokenKey) => {
		const token = '0x20c0000000000000000000000000000000000001'
		const portal = '0x5ad0000000000000000000000000000000000001'
		expect(
			activitiesToKnownEvents(
				[
					{
						id: 'activity-1',
						title: 'Low-level private activity',
						type,
						data: {
							actionId: `0x${'1'.repeat(64)}`,
							[amountKey]: '1000000',
							[tokenKey]: token,
							assets: '1000000',
							shares: '500000',
							assetToken: '0x20c0000000000000000000000000000000000002',
							shareToken: '0x20c0000000000000000000000000000000000003',
						},
					},
				],
				{ portal },
			),
		).toEqual([
			{
				type,
				parts: [
					{
						type: 'action',
						value:
							type === 'private-assets-deposited'
								? 'Vault Deposit'
								: 'Vault Withdrawal',
					},
					{
						type: 'amount',
						value: {
							value: type === 'private-assets-deposited' ? 1000000n : 500000n,
							token:
								type === 'private-assets-deposited'
									? '0x20c0000000000000000000000000000000000002'
									: '0x20c0000000000000000000000000000000000003',
						},
					},
					{ type: 'text', value: 'for' },
					{
						type: 'amount',
						value: {
							value: type === 'private-assets-deposited' ? 500000n : 1000000n,
							token:
								type === 'private-assets-deposited'
									? '0x20c0000000000000000000000000000000000003'
									: '0x20c0000000000000000000000000000000000002',
						},
					},
				],
			},
			{
				type,
				parts: [
					{ type: 'action', value: action },
					{
						type: 'amount',
						value: {
							value: type === 'private-assets-deposited' ? 500000n : 1000000n,
							token:
								type === 'private-assets-deposited'
									? '0x20c0000000000000000000000000000000000003'
									: token,
						},
					},
					{ type: 'text', value: 'to' },
					{ type: 'account', value: portal },
				],
			},
		])
	})
})
