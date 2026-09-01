import { describe, expect, it } from 'vitest'
import * as Address from 'ox/Address'
import type * as Hex from 'ox/Hex'
import type { AbiEvent, AbiParameter } from 'viem'
import {
	encodeAbiParameters,
	encodeEventTopics,
	encodeFunctionData,
	toHex,
	zeroHash,
} from 'viem'
import { Addresses } from 'viem/tempo'
import { Addresses as ZoneAddresses } from 'viem-zones/tempo'
import {
	Abis,
	earnEventsAbi,
	stablecoinDexAbi,
	zoneFactoryAbi,
	zoneOutboxAbi,
	zonePortalAbi,
} from '#lib/abis'
import {
	accountAddress,
	getTokenMetadata,
	mockLog,
	mockReceipt,
	recipientAddress,
	userTokenAddress,
} from '#lib/demo'
import {
	decodeKnownCall,
	decodeKnownTransactionCall,
	parseKnownEvent,
	parseKnownEvents,
} from '#lib/domain/known-events'

const ZONE_5_PORTAL = '0x7069DeC4E64Fd07334A0933eDe836C17259c9B23' as const
const ZONE_E_PORTAL = '0x59831A17340EE14FE136d751EfbeA8b630470fD2' as const
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

function sampleZoneEventValue(parameter: AbiParameter): unknown {
	const array = /^(.*)\[\]$/.exec(parameter.type)
	if (array?.[1])
		return [
			sampleZoneEventValue({ ...parameter, type: array[1] } as AbiParameter),
		]
	if (parameter.type === 'address') return accountAddress
	if (parameter.type === 'bool') return true
	if (parameter.type === 'string') return 'test'
	if (parameter.type === 'bytes') return '0x1234'
	if (parameter.type.startsWith('bytes')) {
		const size = Number(parameter.type.slice('bytes'.length))
		return `0x${'11'.repeat(size)}`
	}
	if (/^u?int\d*$/.test(parameter.type)) return 1n
	throw new Error(`Missing sample value for ${parameter.type}`)
}

function mockZoneEventLog(
	event: AbiEvent,
	address: Address.Address,
	overrides: Record<string, unknown> = {},
) {
	const args = {
		...Object.fromEntries(
			event.inputs.map((input) => [input.name, sampleZoneEventValue(input)]),
		),
		...overrides,
	}
	const dataInputs = event.inputs.filter((input) => !input.indexed)
	return mockLog(
		{
			address,
			topics: encodeEventTopics({
				abi: [event],
				eventName: event.name,
				args,
			}) as [Hex.Hex, ...Hex.Hex[]],
			data: encodeAbiParameters(
				dataInputs,
				dataInputs.map(
					(input) => args[input.name] ?? sampleZoneEventValue(input),
				),
			),
		},
		`0x${'9'.repeat(64)}`,
	)
}

const encryptedDepositMadeAbi = [
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
			{ indexed: false, name: 'netAmount', type: 'uint128' },
			{ indexed: false, name: 'fee', type: 'uint128' },
			{ indexed: false, name: 'keyIndex', type: 'uint256' },
			{ indexed: false, name: 'ephemeralPubkeyX', type: 'bytes32' },
			{ indexed: false, name: 'ephemeralPubkeyYParity', type: 'uint8' },
			{ indexed: false, name: 'ciphertext', type: 'bytes' },
			{ indexed: false, name: 'nonce', type: 'bytes12' },
			{ indexed: false, name: 'tag', type: 'bytes16' },
			{ indexed: false, name: 'tempoRefundRecipient', type: 'address' },
			{ indexed: false, name: 'depositNumber', type: 'uint64' },
		],
		anonymous: false,
	},
] as const

describe('parseKnownEvents', () => {
	it('describes every Zone write call', () => {
		const portal = '0x5ad0000000000000000000000000000000000003' as const
		const calls = [
			{
				to: ZoneAddresses.zoneFactory,
				input: encodeFunctionData({
					abi: zoneFactoryAbi,
					functionName: 'createZone',
					args: [
						{
							initialToken: userTokenAddress,
							accessMode: true,
							gatewayMode: false,
							allowedAccounts: [accountAddress],
							zoneGateways: [],
							admin: accountAddress,
							sequencers: [recipientAddress],
							threshold: 1,
							rpcUrl: 'https://zone.example',
						},
					],
				}),
				action: 'Create Zone',
			},
			{
				to: portal,
				input: encodeFunctionData({
					abi: zonePortalAbi,
					functionName: 'deposit',
					args: [
						userTokenAddress,
						recipientAddress,
						1_000_000n,
						zeroHash,
						accountAddress,
					],
				}),
				action: 'Deposit to Zone 3',
			},
			{
				to: portal,
				input: encodeFunctionData({
					abi: zonePortalAbi,
					functionName: 'depositEncrypted',
					args: [
						userTokenAddress,
						1_000_000n,
						1n,
						{
							ephemeralPubkeyX: zeroHash,
							ephemeralPubkeyYParity: 2,
							ciphertext: '0x1234',
							nonce: `0x${'00'.repeat(12)}`,
							tag: `0x${'00'.repeat(16)}`,
						},
						accountAddress,
					],
				}),
				action: 'Encrypted Deposit to Zone 3',
			},
			{
				to: portal,
				input: encodeFunctionData({
					abi: zonePortalAbi,
					functionName: 'pause',
				}),
				action: 'Pause Zone 3 Portal',
			},
			{
				to: portal,
				input: encodeFunctionData({
					abi: zonePortalAbi,
					functionName: 'submitBatch',
					args: [
						1n,
						0n,
						{ prevBlockHash: zeroHash, nextBlockHash: zeroHash },
						{
							prevProcessedHash: zeroHash,
							nextProcessedHash: zeroHash,
							prevDepositNumber: 0n,
							nextDepositNumber: 0n,
						},
						zeroHash,
						'0x',
						'0x',
						1n,
						[],
					],
				}),
				action: 'Submit Zone Batch',
			},
			{
				to: ZoneAddresses.zoneOutbox,
				input: encodeFunctionData({
					abi: zoneOutboxAbi,
					functionName: 'requestWithdrawal',
					args: [
						userTokenAddress,
						recipientAddress,
						1_000_000n,
						zeroHash,
						100_000n,
						accountAddress,
						'0x',
						'0x',
					],
				}),
				action: 'Request Zone Withdrawal',
			},
		] as const

		for (const call of calls) {
			expect(decodeKnownCall(call.to, call.input)?.parts[0]).toEqual({
				type: 'action',
				value: call.action,
			})
		}

		expect(
			decodeKnownTransactionCall({
				to: accountAddress,
				input: '0x',
				calls: [{ to: calls[4].to, input: calls[4].input }],
			})?.parts[0],
		).toEqual({ type: 'action', value: 'Submit Zone Batch' })
	})

	it('maps every Zone ABI event to a known event', () => {
		const portal = '0x5ad0000000000000000000000000000000000003' as const
		const eventGroups = [
			{ abi: zoneFactoryAbi, address: Addresses.tip20Factory },
			{ abi: zonePortalAbi, address: portal },
			{ abi: zoneOutboxAbi, address: accountAddress },
		] as const

		for (const { abi, address } of eventGroups) {
			for (const item of abi) {
				if (item.type !== 'event') continue
				const receipt = mockReceipt(
					[mockZoneEventLog(item, address)],
					accountAddress,
					`0x${'9'.repeat(64)}`,
				)
				expect(
					parseKnownEvents(receipt, { getTokenMetadata }),
					`${item.name} should be a known event`,
				).toHaveLength(1)
			}
		}
	})

	it('labels sender-tagged Zone withdrawals as private', () => {
		const portal = '0x5ad0000000000000000000000000000000000003' as const
		const withdrawalProcessed = zonePortalAbi.find(
			(item): item is AbiEvent =>
				item.type === 'event' &&
				item.name === 'WithdrawalProcessed' &&
				item.inputs.some((input) => input.name === 'senderTag'),
		)
		expect(withdrawalProcessed).toBeDefined()
		if (!withdrawalProcessed) return

		const [event] = parseKnownEvents(
			mockReceipt(
				[mockZoneEventLog(withdrawalProcessed, portal)],
				accountAddress,
				`0x${'9'.repeat(64)}`,
			),
			{ getTokenMetadata },
		)

		expect(event?.parts[0]).toEqual({
			type: 'action',
			value: 'Private Zone Withdrawal',
		})
	})

	it('decodes stablecoin DEX OrderFlipped buy and sell events', () => {
		const hash = `0x${'6'.repeat(64)}` as const
		const amount = 1_000_000n
		const token = Address.checksum(userTokenAddress)
		const logs = [
			mockLog(
				{
					address: Addresses.stablecoinDex,
					topics: encodeEventTopics({
						abi: stablecoinDexAbi,
						eventName: 'OrderFlipped',
						args: {
							orderId: 123n,
							maker: accountAddress,
							token,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[
							{ type: 'uint128' },
							{ type: 'bool' },
							{ type: 'int16' },
							{ type: 'int16' },
						],
						[amount, true, 100, 98],
					),
				},
				hash,
			),
			mockLog(
				{
					address: Addresses.stablecoinDex,
					topics: encodeEventTopics({
						abi: stablecoinDexAbi,
						eventName: 'OrderFlipped',
						args: {
							orderId: 124n,
							maker: accountAddress,
							token,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[
							{ type: 'uint128' },
							{ type: 'bool' },
							{ type: 'int16' },
							{ type: 'int16' },
						],
						[amount, false, 98, 100],
					),
				},
				hash,
			),
		]

		const receipt = mockReceipt(logs, accountAddress, hash)
		const knownEvents = parseKnownEvents(receipt, { getTokenMetadata })

		expect(knownEvents).toHaveLength(2)
		expect(knownEvents[0]).toMatchObject({
			type: 'order flipped',
			parts: [
				{ type: 'action', value: 'Flip Buy' },
				{
					type: 'amount',
					value: {
						token,
						value: amount,
						symbol: 'USDC',
					},
				},
				{ type: 'text', value: 'at tick' },
				{ type: 'tick', value: 100 },
			],
			note: [
				['Flip Tick', { type: 'tick', value: 98 }],
				['Order ID', { type: 'number', value: 123n }],
			],
		})
		expect(knownEvents[1]?.parts[0]).toEqual({
			type: 'action',
			value: 'Flip Sell',
		})
		expect(knownEvents[1]?.parts[3]).toEqual({ type: 'tick', value: 98 })
		expect(knownEvents[1]?.note).toEqual([
			['Flip Tick', { type: 'tick', value: 100 }],
			['Order ID', { type: 'number', value: 124n }],
		])
	})

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

	it('labels Zone E deposits', () => {
		const hash = `0x${'3'.repeat(64)}` as const
		const amount = 500_000n
		const logs = [
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: { from: accountAddress, to: ZONE_E_PORTAL },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			),
		]

		const receipt = mockReceipt(logs, accountAddress, hash)
		const knownEvents = parseKnownEvents(receipt, { getTokenMetadata })

		expect(knownEvents).toHaveLength(1)
		expect(knownEvents[0]?.type).toBe('zone deposit')
		expect(knownEvents[0]?.parts[0]).toEqual({
			type: 'action',
			value: 'Deposit to Zone E',
		})
	})

	it('does not label a Zone Messenger transfer as a completed withdrawal', () => {
		const hash = `0x${'4'.repeat(64)}` as const
		const amount = 500_000n
		const logs = [
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: ZONE_5_PORTAL,
							to: ZoneAddresses.zoneMessenger,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			),
		]

		const [event] = parseKnownEvents(mockReceipt(logs, accountAddress, hash), {
			getTokenMetadata,
		})

		expect(event).toMatchObject({
			type: 'send',
			parts: [
				{ type: 'action', value: 'Send' },
				{ type: 'amount' },
				{ type: 'text', value: 'to' },
				{
					type: 'account',
					value: Address.checksum(ZoneAddresses.zoneMessenger),
				},
			],
		})
	})

	it('decodes current ZoneCreated events', () => {
		const hash = `0x${'4'.repeat(64)}` as const
		const portal = `0x${'7'.repeat(40)}` as const
		const verifier = `0x${'6'.repeat(40)}` as const
		const sequencers = [accountAddress, recipientAddress] as const
		const logs = [
			mockLog(
				{
					address: Addresses.tip20Factory,
					topics: encodeEventTopics({
						abi: zoneFactoryAbi,
						eventName: 'ZoneCreated',
						args: { zoneId: 8, portal },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[
							{ type: 'address' },
							{ type: 'bool' },
							{ type: 'bool' },
							{ type: 'address' },
							{ type: 'address[]' },
							{ type: 'uint8' },
							{ type: 'address' },
						],
						[
							userTokenAddress,
							true,
							false,
							accountAddress,
							sequencers,
							2,
							verifier,
						],
					),
				},
				hash,
			),
		]

		const [event] = parseKnownEvents(mockReceipt(logs, accountAddress, hash), {
			getTokenMetadata,
		})

		expect(event).toMatchObject({
			type: 'zone created',
			note: [
				[
					'Sequencer 1',
					{ type: 'account', value: Address.checksum(accountAddress) },
				],
				[
					'Sequencer 2',
					{ type: 'account', value: Address.checksum(recipientAddress) },
				],
				['Initial Token', { type: 'token' }],
				['Verifier', { type: 'account', value: Address.checksum(verifier) }],
			],
			meta: { to: Address.checksum(portal) },
		})
	})

	it('decodes current BatchSubmitted events', () => {
		const hash = `0x${'5'.repeat(64)}` as const
		const portal = '0x5ad0000000000000000000000000000000000003' as const
		const nextProcessedHash = `0x${'1'.repeat(64)}` as const
		const nextBlockHash = `0x${'2'.repeat(64)}` as const
		const withdrawalQueueHash = `0x${'3'.repeat(64)}` as const
		const logs = [
			mockLog(
				{
					address: portal,
					topics: [
						'0x5a66941dc92cb865480c966eff640c02b1d00d544b74332fd67c6f1cbfccdf39',
						toHex(337n, { size: 32 }),
						toHex(4n, { size: 32 }),
					],
					data: encodeAbiParameters(
						[
							{ type: 'bytes32' },
							{ type: 'bytes32' },
							{ type: 'bytes32' },
							{ type: 'uint64' },
						],
						[nextProcessedHash, nextBlockHash, withdrawalQueueHash, 35n],
					),
				},
				hash,
			),
		]

		const [event] = parseKnownEvents(mockReceipt(logs, accountAddress, hash), {
			getTokenMetadata,
		})

		expect(event).toMatchObject({
			type: 'zone batch submitted',
			parts: [{ type: 'action', value: 'Submit Zone Batch' }],
			note: [
				['Batch Index', { type: 'number', value: 337n }],
				['Withdrawal Queue Index', { type: 'number', value: 4n }],
				['Processed Deposits', { type: 'hex', value: nextProcessedHash }],
				['Next Block', { type: 'hex', value: nextBlockHash }],
				['Withdrawal Queue', { type: 'hex', value: withdrawalQueueHash }],
				['Last Processed Deposit', { type: 'number', value: 35n }],
			],
		})
	})

	it('labels virtual address outgoing transfers as forwarded', () => {
		const hash = `0x${'5'.repeat(64)}` as const
		const virtualAddress = '0xb385A519FDFDFDfdfdFDfdFdFDFD000000000001' as const
		const amount = 100_000_000n
		const logs = [
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: accountAddress,
							to: virtualAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			),
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: virtualAddress,
							to: recipientAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			),
		]

		const receipt = mockReceipt(logs, accountAddress, hash)
		const knownEvents = parseKnownEvents(receipt, { getTokenMetadata })

		expect(knownEvents[0]?.parts[0]).toEqual({
			type: 'action',
			value: 'Send',
		})
		expect(knownEvents[1]?.parts[0]).toEqual({
			type: 'action',
			value: 'Forwarded',
		})
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

	it('does not expose the encrypted recipient of current Zone deposits', () => {
		const hash = `0x${'4'.repeat(64)}` as const
		const netAmount = 1_000_000n
		const topics = encodeEventTopics({
			abi: encryptedDepositMadeAbi,
			eventName: 'DepositMade',
			args: {
				newCurrentDepositQueueHash: zeroHash,
				sender: accountAddress,
			},
		}) as [Hex.Hex, ...Hex.Hex[]]
		const data = encodeAbiParameters(
			encryptedDepositMadeAbi[0].inputs.filter((input) => !input.indexed),
			[
				userTokenAddress,
				netAmount,
				0n,
				3n,
				zeroHash,
				3,
				`0x${'11'.repeat(64)}`,
				`0x${'22'.repeat(12)}`,
				`0x${'33'.repeat(16)}`,
				recipientAddress,
				70n,
			],
		)
		const receipt = mockReceipt(
			[mockLog({ address: UNKNOWN_ZONE_PORTAL, topics, data }, hash)],
			accountAddress,
			hash,
		)

		const [event] = parseKnownEvents(receipt, { getTokenMetadata })
		expect(event?.type).toBe('zone deposit')
		expect(event?.parts[0]).toEqual({
			type: 'action',
			value: 'Private Zone Deposit',
		})
		expect(event?.parts).toHaveLength(2)
		expect(event?.parts.some((part) => part.type === 'account')).toBe(false)
	})

	it('describes every bundled Earn event on the transaction Events page', () => {
		for (const abiEvent of earnEventsAbi) {
			const log = mockZoneEventLog(abiEvent, accountAddress)
			const event = parseKnownEvent(log)

			expect.soft(event?.type, abiEvent.name).toBe('earn event')
			expect.soft(event?.parts[0]?.type, abiEvent.name).toBe('action')
		}
	})

	it.each([
		['EarnDeposit', 7, 'Earn Deposit'],
		['EarnRedeem', 7, 'Earn Redemption'],
		['Deposited', 4, 'Earn Vault Deposit'],
		['Deposited', 3, 'Earn Engine Deposit'],
		['Redeemed', 4, 'Earn Vault Redemption'],
		['Redeemed', 3, 'Earn Engine Redemption'],
	] as const)('labels %s/%i without relying on contract verification', (name, arity, label) => {
		const abiEvent = earnEventsAbi.find(
			(event) => event.name === name && event.inputs.length === arity,
		)
		expect(abiEvent).toBeDefined()
		if (!abiEvent) return

		const event = parseKnownEvent(mockZoneEventLog(abiEvent, accountAddress))
		expect(event?.parts[0]).toEqual({ type: 'action', value: label })
	})

	it('composes a public Earn deposit receipt with inferred asset and share tokens', () => {
		const hash = `0x${'7'.repeat(64)}` as const
		const vault = recipientAddress
		const shareToken = Address.from(
			'0x20c0000000000000000000000000000000000012',
		)
		const assets = 1_000_000n
		const earnShares = 500_000n
		const deposited = earnEventsAbi.find(
			(event) => event.name === 'Deposited' && event.inputs.length === 4,
		)
		expect(deposited).toBeDefined()
		if (!deposited) return

		const logs = [
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: { from: accountAddress, to: vault },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [assets]),
				},
				hash,
			),
			mockLog(
				{
					address: shareToken,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Mint',
						args: { to: accountAddress },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [earnShares]),
				},
				hash,
			),
			mockZoneEventLog(deposited, vault, {
				caller: accountAddress,
				receiver: accountAddress,
				assets,
				earnShares,
			}),
		]

		const summary = parseKnownEvents(
			mockReceipt(logs, accountAddress, hash),
		).find((event) => event.type === 'earn deposit')

		expect(summary?.parts).toEqual([
			{ type: 'action', value: 'Earn Deposit' },
			{
				type: 'amount',
				value: { token: Address.checksum(userTokenAddress), value: assets },
			},
			{ type: 'text', value: 'for' },
			{
				type: 'amount',
				value: { token: Address.checksum(shareToken), value: earnShares },
			},
		])
	})

	it('composes Earn reward funding and root publication receipt rows', () => {
		const hash = `0x${'6'.repeat(64)}` as const
		const distributor = recipientAddress
		const shareToken = Address.from(
			'0x20c0000000000000000000000000000000000012',
		)
		const earnShares = 750_000n
		const totalEntitlement = 700_000n
		const assetsFunded = earnEventsAbi.find(
			(event) => event.name === 'AssetsFunded',
		)
		const rootPublished = earnEventsAbi.find(
			(event) => event.name === 'RootPublished',
		)
		expect(assetsFunded).toBeDefined()
		expect(rootPublished).toBeDefined()
		if (!assetsFunded || !rootPublished) return

		const logs = [
			mockLog(
				{
					address: shareToken,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Mint',
						args: { to: distributor },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [earnShares]),
				},
				hash,
			),
			mockZoneEventLog(assetsFunded, distributor, {
				funder: accountAddress,
				assets: earnShares,
				earnShares,
			}),
			mockZoneEventLog(rootPublished, distributor, {
				version: 12n,
				totalEntitlement,
			}),
		]

		const summaries = parseKnownEvents(
			mockReceipt(logs, accountAddress, hash),
		).filter((event) => event.type.startsWith('earn reward'))

		expect(summaries).toEqual([
			{
				type: 'earn reward funding',
				parts: [
					{ type: 'action', value: 'Fund Earn Rewards' },
					{
						type: 'amount',
						value: { token: Address.checksum(shareToken), value: earnShares },
					},
				],
			},
			{
				type: 'earn reward root',
				parts: [
					{ type: 'action', value: 'Publish Earn Reward Root' },
					{ type: 'text', value: 'v12 for' },
					{
						type: 'amount',
						value: {
							token: Address.checksum(shareToken),
							value: totalEntitlement,
						},
					},
				],
			},
		])
	})

	it.each([
		['EarnDeposit', 7, 'earn private deposit'],
		['EarnRedeem', 7, 'earn private redemption'],
		['Redeemed', 4, 'earn redemption'],
		['WithdrewExact', 4, 'earn exact withdrawal'],
		['VenueSharesDeposited', 5, 'earn in-kind deposit'],
		['Funded', 3, 'earn contribution'],
		['Contributed', 5, 'earn contribution'],
		['AssetsFunded', 3, 'earn reward funding'],
		['RootPublished', 4, 'earn reward root'],
		['BatchPushed', 6, 'earn reward distribution'],
		['RewardClaimed', 3, 'earn reward claim'],
		['RedeemRequested', 4, 'earn async redemption request'],
		['RedeemFinalized', 5, 'earn async redemption finalized'],
		['RedeemCancelled', 3, 'earn async redemption cancelled'],
		['EngineMigrated', 8, 'earn engine migration'],
	] as const)('composes the %s/%i major-flow receipt summary', (name, arity, expectedType) => {
		const abiEvent = earnEventsAbi.find(
			(event) => event.name === name && event.inputs.length === arity,
		)
		expect(abiEvent).toBeDefined()
		if (!abiEvent) return

		const summaries = parseKnownEvents(
			mockReceipt(
				[mockZoneEventLog(abiEvent, recipientAddress)],
				accountAddress,
			),
		)
		expect(summaries.some((event) => event.type === expectedType)).toBe(true)
	})

	it('keeps lower-level Earn events out of aggregate receipt summaries', () => {
		const feesAccrued = earnEventsAbi.find(
			(event) => event.name === 'FeesAccrued',
		)
		expect(feesAccrued).toBeDefined()
		if (!feesAccrued) return

		const receipt = mockReceipt(
			[mockZoneEventLog(feesAccrued, accountAddress)],
			accountAddress,
		)
		expect(parseKnownEvents(receipt)).toEqual([])
	})
})
