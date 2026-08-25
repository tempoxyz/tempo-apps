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
		[
			'private-assets-deposited',
			'Private Zone Deposit',
			'inputAmount',
			'inputToken',
		],
		[
			'private-shares-redeemed',
			'Private Zone Withdrawal',
			'outputAmount',
			'outputToken',
		],
	])('simplifies %s', (type, action, amountKey, tokenKey) => {
		const token = '0x20c0000000000000000000000000000000000001'
		const portal = '0x5ad0000000000000000000000000000000000001'
		const vaultAssetToken = '0x20c0000000000000000000000000000000000002'
		const vaultShareToken = '0x20c0000000000000000000000000000000000003'
		const isDeposit = type === 'private-assets-deposited'
		expect(
			activitiesToKnownEvents(
				[
					{
						id: 'activity-1',
						title: 'Low-level private activity',
						type,
						data: {
							actionId: `0x${'1'.repeat(64)}`,
							assets: '1000000',
							shares: '500000',
							[amountKey]: '1000000',
							[tokenKey]: token,
							vaultAssetToken,
							vaultShareToken,
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
						value: isDeposit ? 'Vault Deposit' : 'Vault Withdrawal',
					},
					{
						type: 'amount',
						value: {
							value: isDeposit ? 1000000n : 500000n,
							token: isDeposit ? vaultAssetToken : vaultShareToken,
						},
					},
					{ type: 'text', value: 'for' },
					{
						type: 'amount',
						value: {
							value: isDeposit ? 500000n : 1000000n,
							token: isDeposit ? vaultShareToken : vaultAssetToken,
						},
					},
				],
				totalAmount: {
					value: 1000000n,
					token: vaultAssetToken,
				},
			},
			{
				type,
				parts: [
					{ type: 'action', value: action },
					{ type: 'amount', value: { value: 1000000n, token } },
					{ type: 'text', value: 'to' },
					{ type: 'account', value: portal },
				],
			},
		])
	})

	test.each([
		['assets-deposited', 'shares', 'Vault Deposit', true],
		['shares-redeemed', 'shares', 'Vault Withdrawal', false],
		['assets-withdrawn', 'sharesBurned', 'Vault Withdrawal', false],
	] as const)('renders %s with asset and share tokens', (type, shareAmountKey, action, isDeposit) => {
		const assetToken = '0x20c0000000000000000000000000000000000001'
		const shareToken = '0x20c0000000000000000000000000000000000002'
		expect(
			activitiesToKnownEvents([
				{
					id: 'activity-1',
					title: 'Raw vault activity',
					type,
					data: {
						assets: '1000000',
						[shareAmountKey]: '500000',
						vaultAssetToken: assetToken,
						vaultShareToken: shareToken,
					},
				},
			]),
		).toEqual([
			{
				type,
				parts: [
					{ type: 'action', value: action },
					{
						type: 'amount',
						value: {
							value: isDeposit ? 1000000n : 500000n,
							token: isDeposit ? assetToken : shareToken,
						},
					},
					{ type: 'text', value: 'for' },
					{
						type: 'amount',
						value: {
							value: isDeposit ? 500000n : 1000000n,
							token: isDeposit ? shareToken : assetToken,
						},
					},
				],
				totalAmount: {
					value: 1000000n,
					token: assetToken,
				},
			},
		])
	})
})
