import { describe, expect, it } from 'vitest'
import * as Address from 'ox/Address'
import type * as Hex from 'ox/Hex'
import type { AbiEvent, AbiParameter } from 'viem'
import {
	decodeEventLog,
	encodeAbiParameters,
	encodeEventTopics,
	encodeFunctionData,
	toHex,
	zeroHash,
} from 'viem'
import { Addresses } from 'viem/tempo'
import {
	Abis,
	earnEventsAbi,
	propAmmEventsAbi,
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
	STREAM_CHANNELS,
} from '#lib/domain/known-events'
import { zoneProverBatchLog } from './fixtures/zone-prover-batch'

const ZONE_5_PORTAL = '0x7069DeC4E64Fd07334A0933eDe836C17259c9B23' as const
const ZONE_E_PORTAL = '0x59831A17340EE14FE136d751EfbeA8b630470fD2' as const
const UNKNOWN_ZONE_PORTAL = `0x${'8'.repeat(40)}` as const
const PROP_AMM_POOL = `0x${'7'.repeat(40)}` as const
const PROP_AMM_OUTPUT_TOKEN = `0x${'6'.repeat(40)}` as const

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
				to: Addresses.zoneFactory,
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
					functionName: 'deposit',
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
				to: Addresses.zoneOutbox,
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
				calls: [{ to: calls[5].to, input: calls[5].input }],
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

	it('names the Stablecoin DEX only beside a fill it emitted', () => {
		const hash = `0x${'5'.repeat(64)}` as const
		const OUSD = '0x20c0000000000000000000006a37da5c996874be' as const
		const USDC = '0x20c000000000000000000000b9537d11c60e8b50' as const
		const attacker = `0x${'7'.repeat(40)}` as const
		const transfer = (token: Hex.Hex, from: Hex.Hex, to: Hex.Hex) =>
			mockLog(
				{
					address: token,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: { from, to },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [1_000_000n]),
				},
				hash,
			)
		const fill = (emitter: Hex.Hex, taker: Hex.Hex = accountAddress) =>
			mockLog(
				{
					address: emitter,
					topics: encodeEventTopics({
						abi: stablecoinDexAbi,
						eventName: 'OrderFilled',
						args: { orderId: 1n, maker: recipientAddress, taker },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[{ type: 'uint128' }, { type: 'bool' }],
						[1_000_000n, true],
					),
				},
				hash,
			)
		const swap = (logs: ReturnType<typeof mockLog>[]) =>
			parseKnownEvents(mockReceipt(logs, accountAddress, hash), {
				getTokenMetadata,
			}).find((event) => event.type === 'swap')
		const dex = Addresses.stablecoinDex

		expect(
			swap([
				transfer(OUSD, accountAddress, dex),
				fill(dex),
				transfer(USDC, dex, accountAddress),
			])?.parts.slice(-2),
		).toEqual([
			{ type: 'text', value: 'on' },
			{ type: 'dexRoute', value: { from: OUSD, to: USDC } },
		])
		// Any contract can emit a Transfer or OrderFilled naming the DEX, and
		// a fill elsewhere in the transaction or for another taker isn't this
		// pair's.
		for (const logs of [
			[
				transfer(OUSD, accountAddress, dex),
				transfer(USDC, dex, accountAddress),
				fill(dex),
			],
			[
				transfer(OUSD, accountAddress, dex),
				fill(dex, attacker),
				transfer(USDC, dex, accountAddress),
			],
			[
				transfer(OUSD, accountAddress, dex),
				transfer(USDC, dex, accountAddress),
			],
			[
				transfer(attacker, accountAddress, dex),
				fill(attacker),
				transfer(attacker, dex, accountAddress),
			],
		])
			expect(swap(logs)?.parts.some((part) => part.type === 'dexRoute')).toBe(
				false,
			)
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
							to: Addresses.zoneMessenger,
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
					value: Address.checksum(Addresses.zoneMessenger),
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

	it('decodes pre-T13 BatchSubmitted events', () => {
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

	it('decodes the live T13 prover batch 177 settlement', () => {
		const log = zoneProverBatchLog
		const decoded = decodeEventLog({
			abi: zonePortalAbi,
			data: log.data,
			topics: [...log.topics],
		})
		expect(decoded).toMatchObject({
			eventName: 'BatchSubmitted',
			args: {
				withdrawalBatchIndex: 177n,
				withdrawalQueueIndex: 2n ** 256n - 1n,
				withdrawalQueueHash: zeroHash,
				lastProcessedDepositNumber: 2n,
				lastProcessedEnabledTokenCount: 1n,
			},
		})
		const [event] = parseKnownEvents(
			mockReceipt(
				[mockLog({ ...log, topics: [...log.topics] }, log.transactionHash)],
				accountAddress,
				log.transactionHash,
			),
			{ getTokenMetadata },
		)
		expect(event).toMatchObject({
			type: 'zone batch submitted',
			note: expect.arrayContaining([
				['Batch Index', { type: 'number', value: 177n }],
				['Last Processed Deposit', { type: 'number', value: 2n }],
			]),
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

	it('composes a propAMM swap and hides its settlement transfers', () => {
		const hash = `0x${'5'.repeat(64)}` as const
		const amountIn = 10_000n
		const amountOut = 11_449n

		const transferLog = (
			token: Address.Address,
			from: Address.Address,
			to: Address.Address,
			amount: bigint,
		) =>
			mockLog(
				{
					address: token,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: { from, to },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			)

		const tradeLog = mockZoneEventLog(propAmmEventsAbi[0], PROP_AMM_POOL, {
			taker: accountAddress,
			recipient: recipientAddress,
			tokenIn: userTokenAddress,
			tokenOut: PROP_AMM_OUTPUT_TOKEN,
			amountIn,
			amountOut,
		})
		const events = parseKnownEvents(
			mockReceipt(
				[
					transferLog(
						userTokenAddress,
						accountAddress,
						PROP_AMM_POOL,
						amountIn,
					),
					transferLog(
						PROP_AMM_OUTPUT_TOKEN,
						PROP_AMM_POOL,
						recipientAddress,
						amountOut,
					),
					tradeLog,
				],
				accountAddress,
				hash,
			),
		)

		expect(events).toEqual([
			{
				type: 'propamm swap',
				parts: [
					{ type: 'action', value: 'propAMM Swap' },
					{
						type: 'amount',
						value: {
							token: Address.checksum(userTokenAddress),
							value: amountIn,
						},
					},
					{ type: 'text', value: 'for' },
					{
						type: 'amount',
						value: {
							token: Address.checksum(PROP_AMM_OUTPUT_TOKEN),
							value: amountOut,
						},
					},
				],
			},
		])
		expect(parseKnownEvent(tradeLog)?.type).toBe('propamm swap')
	})

	it('decodes a listed propAMM v2 post as a quote', () => {
		const venue = '0x26ec6abf0da64f00e8bd342de9b89e0c7646e3e3'
		const base = '0x20c0000000000000000000001621e21F71CF12fb'
		const quote = '0x20c0000000000000000000006a37DA5C996874BE'
		// mid 1.1003, bid widen 1.5 bp, ask widen 2 bp, width 1.25x, depth 0.5x,
		// shape 3, valid until 2026-11-18 21:26:21 UTC, seq 143333, asks off.
		const hotWord = `0x${(
			1_100_300_000_000_000_000n |
			(15n << 96n) |
			(20n << 112n) |
			(1250n << 128n) |
			(500n << 144n) |
			(3n << 160n) |
			(1_795_037_181n << 168n) |
			(143_333n << 208n) |
			(2n << 240n)
		)
			.toString(16)
			.padStart(64, '0')}` as Hex.Hex
		const postLog = mockZoneEventLog(propAmmEventsAbi[2], venue, {
			pairIndex: 0,
			hotWord,
		})
		const getTokenMetadata = ((address: string) =>
			({
				[base.toLowerCase()]: { symbol: 'EURC.e' },
				[quote.toLowerCase()]: { symbol: 'OUSD' },
			})[address.toLowerCase()]) as never

		// Shape #3: bids 100k at 0.5 bp then 100k at 1 bp; asks 50k at 0.8 bp.
		const getPropAmmShape = () => ({
			bids: [
				{ size: 100_000, spread: 5 },
				{ size: 100_000, spread: 10 },
			],
			asks: [{ size: 50_000, spread: 8 }],
			sizeUnit: 1_000_000n,
		})
		// Asks are off, so only the bid shows. Bid offset: 5 * 1250 + 15 * 1000
		// = 21,250 / 1e8 = 2.125 bp; size: 200k * 0.5 depth = 100k EURC.e.
		expect(
			parseKnownEvent(postLog, {
				getTokenMetadata,
				chainId: 4217,
				getPropAmmShape,
			}),
		).toEqual({
			type: 'propamm quote',
			parts: [
				{ type: 'action', value: 'propAMM Quote' },
				{ type: 'token', value: { address: base, symbol: 'EURC.e' } },
				{ type: 'text', value: 'Bid' },
				{
					type: 'number',
					value: [
						(1_100_300_000_000_000_000n * 99_978_750n) / 100_000_000n,
						18,
					],
				},
				{ type: 'text', value: '/ Ask off' },
				{ type: 'token', value: { address: quote, symbol: 'OUSD' } },
			],
			note: [
				[
					'Bid',
					{
						type: 'text',
						value: 'mid - 2.13 bp, incl. 1.5 bp widen, 2 levels',
					},
				],
				[
					'Bid Size',
					{
						type: 'amount',
						value: { token: base, value: 100_000_000_000n, symbol: 'EURC.e' },
					},
				],
				['Ask', { type: 'text', value: 'off' }],
				['Mid', { type: 'number', value: [1_100_300_000_000_000_000n, 18] }],
				['Valid Until', { type: 'text', value: '2026-11-18 21:26:21 UTC' }],
				['Width', { type: 'text', value: '1.25x' }],
				['Depth Scale', { type: 'text', value: '0.5x' }],
				['Shape', { type: 'text', value: '#3' }],
				['Sequence', { type: 'number', value: 143_333 }],
			],
		})
		// Without the shape the label says the ladder wasn't read.
		expect(
			parseKnownEvent(postLog, { getTokenMetadata, chainId: 4217 })?.note,
		).toContainEqual([
			'Bid',
			{ type: 'text', value: 'shape #3 ladder + 1.5 bp widen' },
		])

		const refillLog = mockZoneEventLog(propAmmEventsAbi[3], venue, {
			pairIndex: 0,
			bids: true,
			asks: true,
		})
		expect(parseKnownEvent(refillLog, { chainId: 4217 })?.parts[0]).toEqual({
			type: 'action',
			value: 'propAMM Refill Bids and Asks',
		})

		// Anyone can emit Posted: an unlisted venue gets no propAMM label.
		const unlisted = mockZoneEventLog(propAmmEventsAbi[2], PROP_AMM_POOL, {
			pairIndex: 0,
			hotWord,
		})
		expect(parseKnownEvent(unlisted, { chainId: 4217 })?.type).not.toBe(
			'propamm quote',
		)
		// Venues are listed per chain: the mainnet venue isn't listed on testnet.
		expect(parseKnownEvent(postLog, { chainId: 42431 })?.type).not.toBe(
			'propamm quote',
		)
	})

	it('composes a propAMM v2 fill from its settlement transfers', () => {
		const hash = `0x${'6'.repeat(64)}` as const
		const amountIn = 50_000_000n
		const amountOut = 55_022_873n

		const transferLog = (
			token: Address.Address,
			from: Address.Address,
			to: Address.Address,
			amount: bigint,
		) =>
			mockLog(
				{
					address: token,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: { from, to },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			)

		const fillLog = mockZoneEventLog(propAmmEventsAbi[1], PROP_AMM_POOL, {
			pairIndex: 0,
			taker: accountAddress,
			ref: `0x${'7'.repeat(64)}`,
			sponsorId: 1n,
			baseIn: true,
			amountIn,
			amountOut,
			makerMid: 1_100_457n,
			seq: 3,
		})
		const logs = [
			transferLog(userTokenAddress, accountAddress, PROP_AMM_POOL, amountIn),
			transferLog(
				PROP_AMM_OUTPUT_TOKEN,
				PROP_AMM_POOL,
				accountAddress,
				amountOut,
			),
			fillLog,
		]
		const swap = {
			type: 'propamm swap',
			parts: [
				{ type: 'action', value: 'propAMM Swap' },
				{
					type: 'amount',
					value: {
						token: Address.checksum(userTokenAddress),
						value: amountIn,
					},
				},
				{ type: 'text', value: 'for' },
				{
					type: 'amount',
					value: {
						token: Address.checksum(PROP_AMM_OUTPUT_TOKEN),
						value: amountOut,
					},
				},
			],
		}

		expect(parseKnownEvents(mockReceipt(logs, accountAddress, hash))).toEqual([
			swap,
		])
		expect(parseKnownEvent(fillLog, { logs })).toEqual(swap)
		// Without its transfers a fill gets no swap label, which would otherwise
		// replace the transaction's other events.
		expect(parseKnownEvent(fillLog)?.type).not.toBe('propamm swap')
	})
	it('describes a receipt whose transfer emitter is not checksummed', () => {
		const hash = `0x${'9'.repeat(64)}` as const
		// Mixed case that is not valid EIP-55.
		const emitter = '0xABCDEF0123456789abcdef0123456789ABCDEF01'
		const log = mockLog(
			{
				address: emitter,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'Transfer',
					args: { from: accountAddress, to: recipientAddress },
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [5n]),
			},
			hash,
		)
		expect(() =>
			parseKnownEvents(mockReceipt([log], accountAddress, hash)),
		).not.toThrow()
	})

	it('matches each propAMM fill and trade in a receipt to its own transfers', () => {
		const hash = `0x${'8'.repeat(64)}` as const
		const transferLog = (
			token: Address.Address,
			from: Address.Address,
			to: Address.Address,
			amount: bigint,
		) =>
			mockLog(
				{
					address: token,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: { from, to },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
				},
				hash,
			)
		const fillLog = (amountIn: bigint, amountOut: bigint, seq: number) =>
			mockZoneEventLog(propAmmEventsAbi[1], PROP_AMM_POOL, {
				pairIndex: 0,
				taker: accountAddress,
				ref: `0x${'7'.repeat(64)}`,
				sponsorId: 1n,
				baseIn: true,
				amountIn,
				amountOut,
				makerMid: 1_100_457n,
				seq,
			})
		// Two trades that share both legs hide the same two transfers.
		const tradeLog = () =>
			mockZoneEventLog(propAmmEventsAbi[0], PROP_AMM_POOL, {
				taker: accountAddress,
				recipient: recipientAddress,
				tokenIn: userTokenAddress,
				tokenOut: PROP_AMM_OUTPUT_TOKEN,
				amountIn: 3_000n,
				amountOut: 3_300n,
			})
		const secondFill = fillLog(2_000n, 2_200n, 2)
		const logs = [
			fillLog(1_000n, 1_100n, 1),
			secondFill,
			tradeLog(),
			tradeLog(),
			transferLog(PROP_AMM_OUTPUT_TOKEN, PROP_AMM_POOL, accountAddress, 2_200n),
			transferLog(userTokenAddress, accountAddress, PROP_AMM_POOL, 1_000n),
			transferLog(userTokenAddress, accountAddress, PROP_AMM_POOL, 2_000n),
			transferLog(PROP_AMM_OUTPUT_TOKEN, PROP_AMM_POOL, accountAddress, 1_100n),
			transferLog(userTokenAddress, accountAddress, PROP_AMM_POOL, 3_000n),
			transferLog(
				PROP_AMM_OUTPUT_TOKEN,
				PROP_AMM_POOL,
				recipientAddress,
				3_300n,
			),
			// Settles nothing, so it stays visible.
			transferLog(userTokenAddress, accountAddress, recipientAddress, 7n),
		]
		const amounts = (event: ReturnType<typeof parseKnownEvent>) =>
			event?.parts.flatMap((part) =>
				part.type === 'amount' ? [part.value.token, part.value.value] : [],
			)
		const swap = (
			amountIn: bigint,
			tokenOut: Address.Address,
			amountOut: bigint,
		) => [
			Address.checksum(userTokenAddress),
			amountIn,
			Address.checksum(tokenOut),
			amountOut,
		]

		const events = parseKnownEvents(mockReceipt(logs, accountAddress, hash))
		const swaps = events.filter((event) => event.type === 'propamm swap')
		expect(swaps.map(amounts)).toEqual([
			swap(1_000n, PROP_AMM_OUTPUT_TOKEN, 1_100n),
			swap(2_000n, PROP_AMM_OUTPUT_TOKEN, 2_200n),
			swap(3_000n, PROP_AMM_OUTPUT_TOKEN, 3_300n),
			swap(3_000n, PROP_AMM_OUTPUT_TOKEN, 3_300n),
		])
		const others = events.filter((event) => event.type !== 'propamm swap')
		expect(others).toHaveLength(1)
		expect(amounts(others[0])?.[1]).toBe(7n)
		expect(amounts(parseKnownEvent(secondFill, { logs }))).toEqual(
			swap(2_000n, PROP_AMM_OUTPUT_TOKEN, 2_200n),
		)
	})

	it.each([
		['EarnDeposit', 7, 'Deposit to Earn'],
		['EarnRedeem', 7, 'Withdraw from Earn'],
		['Deposited', 4, 'Deposit to Earn'],
		['Deposited', 3, 'Deposit to Earn'],
		['Redeemed', 4, 'Withdraw from Earn'],
		['Redeemed', 3, 'Withdraw from Earn'],
		['VenueSharesDeposited', 5, 'Move Position to Earn'],
		['VenueSharesDeposited', 3, 'Move Position to Earn'],
		['WithdrewExact', 4, 'Withdraw from Earn'],
		['WithdrewExact', 3, 'Withdraw from Earn'],
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
			{ type: 'action', value: 'Deposit to Earn' },
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

	it('uses the first distinct, non-excluded burn token for each Earn redemption', () => {
		const burn = Abis.tip20.find(
			(event) => event.type === 'event' && event.name === 'Burn',
		)!
		const feeBurn = Abis.feeAmm.find(
			(event) => event.type === 'event' && event.name === 'Burn',
		)!
		const redeem = earnEventsAbi.find((event) => event.name === 'EarnRedeem')!
		const tokenA = userTokenAddress
		const tokenB = recipientAddress
		const burnLog = (token: Address.Address) =>
			mockZoneEventLog(burn, token, { from: accountAddress, amount: 17n })
		const redemption = (outputToken: Address.Address) =>
			mockZoneEventLog(redeem, accountAddress, { outputToken, earnShares: 17n })
		const logs = [
			redemption(tokenA),
			mockZoneEventLog(feeBurn, accountAddress, { amountUserToken: 17n }),
			burnLog(tokenA),
			burnLog(tokenA),
			burnLog(tokenB),
			redemption(tokenB),
		]
		const events = parseKnownEvents(mockReceipt(logs, accountAddress))
		const shares = events
			.filter((event) => event.type === 'earn private redemption')
			.map((event) => event.parts[1])
		expect(shares).toEqual(
			[tokenB, tokenA].map((token) => ({
				type: 'amount',
				value: { value: 17n, token: Address.checksum(token) },
			})),
		)
	})

	it('uses the earliest transfer at either channel participant and requires a channel-emitted event', () => {
		const topUp = Abis.streamChannel.find((event) => event.name === 'TopUp')!
		const transfer = Abis.tip20.find(
			(event) => event.type === 'event' && event.name === 'Transfer',
		)!
		const [channel, otherChannel] = STREAM_CHANNELS
		const tokenA = userTokenAddress
		const tokenB = PROP_AMM_OUTPUT_TOKEN
		const channelEvent = mockZoneEventLog(topUp, channel, {
			payer: accountAddress,
			payee: recipientAddress,
			additionalDeposit: 9n,
		})
		const payerTransfer = mockZoneEventLog(transfer, tokenA, {
			from: accountAddress,
			to: otherChannel,
		})
		const payeeTransfer = mockZoneEventLog(transfer, tokenB, {
			from: channel,
			to: recipientAddress,
		})
		for (const [first, later, token] of [
			[payeeTransfer, payerTransfer, tokenB],
			[payerTransfer, payeeTransfer, tokenA],
		] as const) {
			const events = parseKnownEvents(
				mockReceipt([first, channelEvent, later, channelEvent], accountAddress),
			)
			expect(events.map((event) => event.type)).toEqual([
				'top up channel',
				'top up channel',
			])
			const amount = { type: 'amount', value: { value: 9n, token } }
			expect(events.map((event) => event.parts[1])).toEqual([amount, amount])
		}
		const unrelated = mockZoneEventLog(topUp, accountAddress, {
			payer: accountAddress,
			payee: recipientAddress,
		})
		const events = parseKnownEvents(
			mockReceipt([payerTransfer, unrelated], accountAddress),
		)
		expect(events.some((event) => event.type === 'send')).toBe(true)
		expect(events.some((event) => event.type === 'top up channel')).toBe(false)
	})

	it('describes an Earn-funded transfer as a Send', () => {
		const hash = `0x${'8'.repeat(64)}` as const
		const vault = recipientAddress
		const shareToken = Address.from(
			'0x20c0000000000000000000000000000000000012',
		)
		const assets = 1_110_000n
		const earnShares = 555_000n
		const withdrewExact = earnEventsAbi.find(
			(event) => event.name === 'WithdrewExact' && event.inputs.length === 4,
		)
		expect(withdrewExact).toBeDefined()
		if (!withdrewExact) return

		const logs = [
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: { from: vault, to: accountAddress },
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
						eventName: 'Burn',
						args: { from: accountAddress },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [earnShares]),
				},
				hash,
			),
			mockZoneEventLog(withdrewExact, vault, {
				caller: accountAddress,
				receiver: accountAddress,
				assets,
				earnSharesBurned: earnShares,
			}),
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: { from: accountAddress, to: recipientAddress },
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [assets]),
				},
				hash,
			),
		]

		const summary = parseKnownEvents(
			mockReceipt(logs, accountAddress, hash),
		).find((event) => event.type === 'earn send')

		expect(summary).toEqual({
			type: 'earn send',
			parts: [
				{ type: 'action', value: 'Send' },
				{
					type: 'amount',
					value: { token: Address.checksum(userTokenAddress), value: assets },
				},
				{ type: 'text', value: 'to' },
				{ type: 'account', value: Address.checksum(recipientAddress) },
			],
			note: [['Source', { type: 'text', value: 'Earn balance' }]],
			meta: {
				from: Address.checksum(accountAddress),
				to: Address.checksum(recipientAddress),
			},
		})
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
					{ type: 'action', value: 'Add Earn Rewards' },
					{
						type: 'amount',
						value: { token: Address.checksum(shareToken), value: earnShares },
					},
				],
			},
			{
				type: 'earn reward root',
				parts: [
					{ type: 'action', value: 'Publish Reward Allocation' },
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
