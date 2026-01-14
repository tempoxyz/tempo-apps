import { Address, Hex } from 'ox'
import {
	type AbiEvent,
	type Log,
	parseEventLogs,
	type TransactionReceipt,
	zeroAddress,
} from 'viem'
import { Abis, Addresses } from 'viem/tempo'

const abi = Object.values(Abis).flat()
const FEE_MANAGER = Addresses.feeManager
const STABLECOIN_EXCHANGE = Addresses.stablecoinDex

type FeeTransferEvent = {
	amount: bigint
	token: Address.Address
	type: 'fee transfer'
}

export function isFeeTransferEvent(
	event: KnownEvent | FeeTransferEvent,
): event is FeeTransferEvent {
	return event.type === 'fee transfer'
}

type ParsedEvent = ReturnType<typeof parseEventLogs<typeof abi>>[number]

export type TokenMetadata = {
	decimals: number
	symbol: string
}

export type GetTokenMetadataFn = (
	address: Address.Address,
) => TokenMetadata | undefined

function createDetectors(
	createAmount: (value: bigint, token: Address.Address) => Amount,
	getTokenMetadata?: GetTokenMetadataFn,
	mintBurnMemos?: Map<string, string>,
	viewer?: Address.Address,
	transactionSender?: Address.Address,
) {
	return {
		tip20(event: ParsedEvent) {
			const { eventName, args, address } = event

			if (eventName === 'Transfer' || eventName === 'TransferWithMemo') {
				const isFeeTransfer =
					Address.isEqual(args.to, FEE_MANAGER) &&
					!Address.isEqual(args.from, zeroAddress)

				if (isFeeTransfer) {
					if (viewer && Address.isEqual(args.from, viewer)) {
						return null
					}
					return {
						type: 'fee transfer',
						amount: args.amount,
						token: address,
					}
				}

				return {
					type: 'send',
					note:
						'memo' in args ? Hex.toString(Hex.trimLeft(args.memo)) : undefined,
					parts: [
						{ type: 'action', value: 'Send' },
						{ type: 'amount', value: createAmount(args.amount, address) },
						{ type: 'text', value: 'to' },
						{ type: 'account', value: args.to },
					],
					meta: { from: args.from, to: args.to },
				}
			}

			if (eventName === 'Mint') {
				if (Address.isEqual(address, FEE_MANAGER) || !('amount' in args))
					return null

				const { amount, to } = args as { amount: bigint; to: Address.Address }
				const mintKey = `mint:${address}:${amount}:${to}`
				const memo = mintBurnMemos?.get(mintKey)

				return {
					type: 'mint',
					note: memo,
					parts: [
						{ type: 'action', value: 'Mint' },
						{ type: 'amount', value: createAmount(amount, address) },
						{ type: 'text', value: 'to' },
						{ type: 'account', value: to },
					],
				}
			}

			if (eventName === 'Burn') {
				if (!('amount' in args)) return null

				const { amount, from } = args as {
					amount: bigint
					from: Address.Address
				}
				const burnKey = `burn:${address}:${amount}:${from}`
				const memo = mintBurnMemos?.get(burnKey)

				return {
					type: 'burn',
					note: memo,
					parts: [
						{ type: 'action', value: 'Burn' },
						{ type: 'amount', value: createAmount(amount, address) },
						{ type: 'text', value: 'from' },
						{ type: 'account', value: from },
					],
				}
			}

			if (eventName === 'RoleMembershipUpdated')
				return {
					type: args.hasRole ? 'grant role' : 'revoke role',
					parts: [
						{
							type: 'action',
							value: args.hasRole ? 'Grant Role' : 'Revoke Role',
						},
						{ type: 'role', value: args.role },
						{ type: 'text', value: 'to' },
						{ type: 'account', value: args.account },
					],
				}

			if (eventName === 'PauseStateUpdate')
				return {
					type: args.isPaused ? 'pause' : 'unpause',
					parts: [
						{
							type: 'action',
							value: args.isPaused ? 'Pause Transfers' : 'Resume Transfers',
						},
						{ type: 'text', value: 'for' },
						{ type: 'token', value: { address } },
					],
				}

			if (eventName === 'Approval')
				return {
					type: 'approval',
					parts: [
						{ type: 'action', value: 'Approve' },
						{ type: 'amount', value: createAmount(args.amount, address) },
						{ type: 'text', value: 'for spender' },
						{ type: 'account', value: args.spender },
					],
				}

			return null
		},

		tip20Factory(event: ParsedEvent) {
			const { eventName, args } = event

			if (eventName === 'TokenCreated')
				return {
					type: 'create token',
					parts: [
						{ type: 'action', value: 'Create Token' },
						{
							type: 'token',
							value: { address: args.token, symbol: args.symbol },
						},
					],
				}

			return null
		},

		stablecoinDex(event: ParsedEvent) {
			const { eventName, args } = event

			if (eventName === 'OrderPlaced') {
				const isFlip = 'isFlipOrder' in args && args.isFlipOrder
				const actionPrefix = isFlip ? 'Flip' : 'Limit'
				return {
					type: isFlip ? 'flip order placed' : 'order placed',
					parts: [
						{
							type: 'action',
							value: `${actionPrefix} ${args.isBid ? 'Buy' : 'Sell'}`,
						},
						{ type: 'amount', value: createAmount(args.amount, args.token) },
						{ type: 'text', value: 'at tick' },
						{ type: 'tick', value: args.tick },
					],
				}
			}

			if (eventName === 'OrderFilled')
				return {
					type: 'order filled',
					parts: [
						{
							type: 'action',
							value: args.partialFill ? 'Partial Fill' : 'Complete Fill',
						},
						{ type: 'text', value: String(args.amountFilled) },
					],
				}

			if (eventName === 'OrderCancelled')
				return {
					type: 'order cancelled',
					parts: [{ type: 'action', value: 'Cancel Order' }],
				}

			return null
		},

		feeManager(event: ParsedEvent) {
			const { eventName, args } = event

			if (eventName === 'UserTokenSet') {
				const metadata = getTokenMetadata?.(args.token)
				return {
					type: 'user token set',
					parts: [
						{ type: 'action', value: 'Set Fee Token' },
						{
							type: 'token',
							value: { address: args.token, symbol: metadata?.symbol },
						},
						{ type: 'text', value: 'for' },
						{ type: 'account', value: args.user },
					],
				}
			}

			return null
		},

		feePayer(event: ParsedEvent) {
			const { eventName, args, address } = event

			if (eventName !== 'Transfer' && eventName !== 'TransferWithMemo')
				return null
			if (!Address.isEqual(args.to, FEE_MANAGER)) return null
			if (Address.isEqual(args.from, zeroAddress)) return null

			if (!viewer || !transactionSender) return null
			if (!Address.isEqual(args.from, viewer)) return null

			if (Address.isEqual(args.from, transactionSender)) {
				return {
					type: 'fee transfer',
					amount: args.amount,
					token: address,
				}
			}

			return {
				type: 'sponsor fee',
				parts: [
					{ type: 'action', value: 'Sponsor Fee' },
					{ type: 'amount', value: createAmount(args.amount, address) },
					{ type: 'text', value: 'for' },
					{ type: 'account', value: transactionSender },
				],
				meta: { from: args.from, to: args.to },
			}
		},
	} as const satisfies Record<
		string,
		(event: ParsedEvent) => KnownEvent | FeeTransferEvent | null
	>
}

type TransferEventArgs = {
	from: Address.Address
	to: Address.Address
	amount: bigint
}

function isTransferEvent(
	event: Log<bigint, number, boolean, AbiEvent>,
): event is Log<bigint, number, boolean, AbiEvent> & {
	eventName: 'Transfer' | 'TransferWithMemo'
	args: TransferEventArgs
	address: Address.Address
} {
	return (
		(event.eventName === 'Transfer' ||
			event.eventName === 'TransferWithMemo') &&
		'args' in event &&
		typeof event.args === 'object' &&
		event.args !== null &&
		'from' in event.args &&
		'to' in event.args &&
		'amount' in event.args &&
		typeof event.args.amount === 'bigint' &&
		typeof event.address === 'string'
	)
}

type Amount = {
	decimals?: number
	symbol?: string
	token: Address.Address
	value: bigint
}

type Token = {
	address: Address.Address
	symbol?: string
}

export type KnownEventPart =
	| { type: 'account'; value: Address.Address }
	| { type: 'action'; value: string }
	| { type: 'amount'; value: Amount }
	| { type: 'duration'; value: number }
	| { type: 'hex'; value: Hex.Hex }
	| {
			type: 'number'
			value: bigint | number | [value: bigint, decimals: number]
	  }
	| { type: 'role'; value: Hex.Hex }
	| { type: 'text'; value: string }
	| { type: 'tick'; value: number }
	| { type: 'token'; value: Token }

export interface KnownEvent {
	type: Exclude<string, FeeTransferEvent['type']>
	parts: KnownEventPart[]
	note?: string | Array<[label: string, value: KnownEventPart]>
	meta?: {
		from?: Address.Address
		to?: Address.Address
	}
}

export function preferredEventsFilter(event: KnownEvent): boolean {
	return (
		event.type !== 'active key count changed' &&
		event.type !== 'nonce incremented'
	)
}

export function parseKnownEvents(
	receipt: TransactionReceipt,
	options?: {
		getTokenMetadata?: GetTokenMetadataFn
		viewer?: Address.Address
	},
): KnownEvent[] {
	const { logs } = receipt
	const events = parseEventLogs({ abi, logs })
	const getTokenMetadata = options?.getTokenMetadata
	const viewer = options?.viewer
	const transactionSender = receipt.from

	const createAmount = (value: bigint, token: Address.Address): Amount => {
		const metadata = getTokenMetadata?.(token)
		const amount: Amount = { token, value }
		if (metadata) {
			amount.decimals = metadata.decimals
			amount.symbol = metadata.symbol
		}
		return amount
	}

	const preferenceMap = new Map<string, string>()
	const feeTransferEvents: Array<{ amount: bigint; token: Address.Address }> =
		[]
	const mintBurnMemos = new Map<string, string>()

	for (const event of events) {
		let key: string | undefined

		if (event.eventName === 'TransferWithMemo') {
			const [_, from, to] = event.topics
			key = `${from}${to}`
		}

		if (event.eventName === 'Mint' && 'amount' in event.args) {
			const { amount, to } = event.args as {
				amount: bigint
				to: Address.Address
			}
			key = `mint:${event.address}:${amount}:${to}`
		}

		if (event.eventName === 'Burn' && 'amount' in event.args) {
			const { amount, from } = event.args as {
				amount: bigint
				from: Address.Address
			}
			key = `burn:${event.address}:${amount}:${from}`
		}

		if (key) preferenceMap.set(key, event.eventName)
	}

	for (const event of events) {
		if (event.eventName === 'TransferWithMemo' && 'memo' in event.args) {
			const { from, to, amount, memo } = event.args as {
				from: Address.Address
				to: Address.Address
				amount: bigint
				memo: Hex.Hex
			}
			const memoText = Hex.toString(Hex.trimLeft(memo))
			if (!memoText) continue

			if (Address.isEqual(from, zeroAddress)) {
				const mintKey = `mint:${event.address}:${amount}:${to}`
				if (preferenceMap.get(mintKey) === 'Mint') {
					mintBurnMemos.set(mintKey, memoText)
				}
			}

			if (Address.isEqual(to, zeroAddress)) {
				const burnKey = `burn:${event.address}:${amount}:${from}`
				if (preferenceMap.get(burnKey) === 'Burn') {
					mintBurnMemos.set(burnKey, memoText)
				}
			}
		}
	}

	const detectors = createDetectors(
		createAmount,
		getTokenMetadata,
		mintBurnMemos,
		viewer,
		transactionSender,
	)

	const dedupedEvents = events.filter((event) => {
		let include = true

		if (event.eventName === 'Transfer') {
			{
				const [_, from, to] = event.topics
				const key = `${from}${to}`
				if (preferenceMap.get(key)?.includes('TransferWithMemo'))
					include = false
			}
			if (
				'args' in event &&
				typeof event.args === 'object' &&
				event.args !== null
			) {
				const { from, to, amount } = event.args as {
					from: Address.Address
					to: Address.Address
					amount: bigint
				}
				if (Address.isEqual(from, zeroAddress)) {
					const mintKey = `mint:${event.address}:${amount}:${to}`
					if (preferenceMap.get(mintKey) === 'Mint') include = false
				}
				if (Address.isEqual(to, zeroAddress)) {
					const burnKey = `burn:${event.address}:${amount}:${from}`
					if (preferenceMap.get(burnKey) === 'Burn') include = false
				}
			}
		}

		if (event.eventName === 'TransferWithMemo') {
			if (
				'args' in event &&
				typeof event.args === 'object' &&
				event.args !== null
			) {
				const { from, to, amount } = event.args as {
					from: Address.Address
					to: Address.Address
					amount: bigint
				}
				if (Address.isEqual(from, zeroAddress)) {
					const mintKey = `mint:${event.address}:${amount}:${to}`
					if (preferenceMap.get(mintKey) === 'Mint') include = false
				}
				if (Address.isEqual(to, zeroAddress)) {
					const burnKey = `burn:${event.address}:${amount}:${from}`
					if (preferenceMap.get(burnKey) === 'Burn') include = false
				}
			}
		}

		return include
	})

	const knownEvents: KnownEvent[] = []

	const swapIndices = new Set<number>()
	const transferEvents = dedupedEvents
		.map((event, index) => ({ event, index }))
		.filter(({ event }) => isTransferEvent(event))
		.map(({ event, index }) => ({
			event: event as typeof event & {
				eventName: 'Transfer' | 'TransferWithMemo'
				args: TransferEventArgs
			},
			index,
		}))

	for (let index = 0; index < transferEvents.length - 1; index++) {
		const { event: event1, index: idx1 } = transferEvents[index]
		const args1 = event1.args
		const to1 = args1.to

		if (Address.isEqual(to1, STABLECOIN_EXCHANGE)) {
			for (
				let innerIndex = index + 1;
				innerIndex < transferEvents.length;
				innerIndex++
			) {
				const { event: event2, index: idx2 } = transferEvents[innerIndex]
				const args2 = event2.args
				const from2 = args2.from

				if (Address.isEqual(from2, STABLECOIN_EXCHANGE)) {
					knownEvents.push({
						type: 'swap',
						parts: [
							{ type: 'action', value: 'Swap' },
							{
								type: 'amount',
								value: createAmount(args1.amount, event1.address),
							},
							{ type: 'text', value: 'for' },
							{
								type: 'amount',
								value: createAmount(args2.amount, event2.address),
							},
						],
					})
					swapIndices.add(idx1)
					swapIndices.add(idx2)
					break
				}
			}
		}
	}

	for (let index = 0; index < dedupedEvents.length; index++) {
		if (swapIndices.has(index)) continue

		const event = dedupedEvents[index]

		const detected =
			detectors.feePayer(event) ||
			detectors.tip20(event) ||
			detectors.tip20Factory(event) ||
			detectors.stablecoinDex(event) ||
			detectors.feeManager(event)

		if (!detected) continue

		if (isFeeTransferEvent(detected)) {
			feeTransferEvents.push(detected)
			continue
		}

		if (viewer && 'meta' in detected && detected.meta) {
			const involvesViewer =
				(detected.meta.from && Address.isEqual(detected.meta.from, viewer)) ||
				(detected.meta.to && Address.isEqual(detected.meta.to, viewer))
			if (!involvesViewer) continue
		}

		knownEvents.push(detected)
	}

	if (knownEvents.length === 0 && feeTransferEvents.length > 0) {
		const parts: KnownEventPart[] = [{ type: 'action', value: 'Pay Fee' }]

		for (const [index, fee] of feeTransferEvents.entries()) {
			if (index > 0) parts.push({ type: 'text', value: 'and' })
			parts.push({ type: 'amount', value: createAmount(fee.amount, fee.token) })
		}

		knownEvents.push({ type: 'fee', parts })
	}

	return knownEvents
}
