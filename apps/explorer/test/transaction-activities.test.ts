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
			parts: [{ type: 'action' as const, value: 'Submit Zone Batch' }],
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
			parts: [{ type: 'action' as const, value: 'Submit Zone Batch' }],
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

	test('recognizes nonce activity from its rendered action', () => {
		const batch = {
			type: 'zone batch submission',
			parts: [{ type: 'action' as const, value: 'Submit Zone Batch' }],
		}
		const nonce = {
			type: 'nonce',
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

	test('maps a finalized Earn redemption into a Vault Withdrawal', () => {
		expect(
			activitiesToKnownEvents([
				{
					id: 'activity-1',
					title: 'Shares redemption finalized',
					type: 'shares-redemption-finalized',
					data: {
						assets: '49999',
						shares: '49999',
						assetToken: '0x20c0000000000000000000000000000000000001',
						shareToken: '0x20c0000000000000000000000000000000000002',
					},
				},
			]),
		).toEqual([
			{
				type: 'shares-redemption-finalized',
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
			'Private Zone Withdrawal',
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
					...(type === 'private-assets-deposited'
						? [
								{ type: 'text' as const, value: 'to' },
								{ type: 'account' as const, value: portal },
							]
						: []),
				],
			},
		])
	})
})

describe('selectTransactionDescriptionEvents for Zones', () => {
	const zoneDeposit = {
		type: 'zone deposit',
		parts: [{ type: 'action' as const, value: 'Deposit to Zone' }],
	}

	test('prefers a decoded Zone event over generic API activities', () => {
		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [
					{ type: 'approval', parts: [] },
					{ type: 'transfer', parts: [] },
				],
				fallbackEvents: [{ type: 'approval', parts: [] }, zoneDeposit],
				knownCall: null,
			}),
		).toEqual([zoneDeposit])
	})

	test('prefers a decoded Zone event over generic token and nonce activities', () => {
		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [
					{ type: 'mint', parts: [] },
					{ type: 'burn', parts: [] },
					{
						type: 'nonce incremented',
						parts: [{ type: 'action' as const, value: 'Nonce Incremented' }],
					},
				],
				fallbackEvents: [zoneDeposit],
				knownCall: null,
			}),
		).toEqual([zoneDeposit])
	})

	test('preserves semantic API activities for Earn transactions', () => {
		const vaultDeposit = {
			type: 'private-assets-deposited',
			parts: [{ type: 'action' as const, value: 'Vault Deposit' }],
		}
		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [vaultDeposit],
				fallbackEvents: [zoneDeposit],
				knownCall: null,
			}),
		).toEqual([vaultDeposit])
	})

	test('preserves a Zone withdrawal alongside private Earn activity', () => {
		const zoneWithdrawal = {
			type: 'zone withdrawal',
			parts: [{ type: 'action' as const, value: 'Private Zone Withdrawal' }],
		}
		const privateZoneDeposit = {
			type: 'zone deposit',
			parts: [{ type: 'action' as const, value: 'Private Zone Deposit' }],
		}
		const vaultDeposit = {
			type: 'private-assets-deposited',
			parts: [{ type: 'action' as const, value: 'Vault Deposit' }],
		}
		const zoneDepositActivity = {
			type: 'private-assets-deposited',
			parts: [{ type: 'action' as const, value: 'Private Zone Deposit' }],
		}

		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [vaultDeposit, zoneDepositActivity],
				fallbackEvents: [privateZoneDeposit, zoneWithdrawal],
				knownCall: null,
			}),
		).toEqual([zoneWithdrawal, vaultDeposit, zoneDepositActivity])
	})

	test('does not duplicate private Zone activity with a low-level decoded call', () => {
		const decodedCall = {
			type: 'zone encrypted deposit',
			parts: [
				{ type: 'action' as const, value: 'Encrypted Deposit to Zone 1' },
			],
		}
		const privateDeposit = {
			type: 'private-assets-deposited',
			parts: [{ type: 'action' as const, value: 'Private Zone Deposit' }],
		}
		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [privateDeposit],
				fallbackEvents: [decodedCall],
				knownCall: decodedCall,
			}),
		).toEqual([privateDeposit])
	})

	test('does not duplicate a private Zone log when API activity is unavailable', () => {
		const decodedCall = {
			type: 'zone encrypted deposit',
			parts: [
				{ type: 'action' as const, value: 'Encrypted Deposit to Zone 1' },
			],
		}
		const privateDeposit = {
			type: 'zone deposit',
			parts: [{ type: 'action' as const, value: 'Private Zone Deposit' }],
		}
		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [],
				fallbackEvents: [decodedCall, privateDeposit],
				knownCall: decodedCall,
			}),
		).toEqual([privateDeposit])
	})
})

describe('selectTransactionDescriptionEvents for Earn receipts', () => {
	test('prefers one composed Earn flow over generic indexed token activity', () => {
		const earnDeposit = {
			type: 'earn deposit',
			parts: [{ type: 'action' as const, value: 'Earn Deposit' }],
		}

		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [
					{ type: 'mint', parts: [] },
					{ type: 'assets-deposited', parts: [] },
				],
				fallbackEvents: [{ type: 'send', parts: [] }, earnDeposit],
				knownCall: null,
			}),
		).toEqual([earnDeposit])
	})

	test('orders a private Earn flow from source Zone through Earn to destination Zone', () => {
		const zoneDeposit = {
			type: 'zone deposit',
			parts: [{ type: 'action' as const, value: 'Private Zone Deposit' }],
		}
		const earnDeposit = {
			type: 'earn private deposit',
			parts: [{ type: 'action' as const, value: 'Earn Deposit' }],
		}
		const zoneWithdrawal = {
			type: 'zone withdrawal',
			parts: [{ type: 'action' as const, value: 'Private Zone Withdrawal' }],
		}

		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [{ type: 'private-assets-deposited', parts: [] }],
				fallbackEvents: [zoneDeposit, earnDeposit, zoneWithdrawal],
				knownCall: null,
			}),
		).toEqual([zoneWithdrawal, earnDeposit, zoneDeposit])
	})

	test('keeps Earn primary and nests a propAMM swap after it', () => {
		const earnWithdrawal = {
			type: 'earn exact withdrawal',
			parts: [{ type: 'action' as const, value: 'Earn Exact Withdrawal' }],
		}
		const propAmmSwap = {
			type: 'propamm swap',
			parts: [{ type: 'action' as const, value: 'propAMM Swap' }],
		}

		expect(
			selectTransactionDescriptionEvents({
				activityEvents: [{ type: 'transfer', parts: [] }],
				fallbackEvents: [propAmmSwap, earnWithdrawal],
				knownCall: null,
			}),
		).toEqual([earnWithdrawal, propAmmSwap])
	})
})

test('prefers a standalone propAMM swap over generic indexed activity', () => {
	const propAmmSwap = {
		type: 'propamm swap',
		parts: [{ type: 'action' as const, value: 'propAMM Swap' }],
	}

	expect(
		selectTransactionDescriptionEvents({
			activityEvents: [{ type: 'transfer', parts: [] }],
			fallbackEvents: [{ type: 'send', parts: [] }, propAmmSwap],
			knownCall: null,
		}),
	).toEqual([propAmmSwap])
})
