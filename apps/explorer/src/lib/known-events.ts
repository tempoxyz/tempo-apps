import { Address, Hex } from 'ox'
import { Abis, Addresses } from 'tempo.ts/viem'
import {
	type AbiEvent,
	type DecodeFunctionDataReturnType,
	decodeFunctionData,
	type Log,
	parseEventLogs,
	type TransactionReceipt,
	zeroAddress,
} from 'viem'

const abi = Object.values(Abis).flat()
const ZERO_ADDRESS = zeroAddress
const FEE_MANAGER = Addresses.feeManager
const STABLECOIN_EXCHANGE = Addresses.stablecoinExchange

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
	| { type: 'hex'; value: Hex.Hex }
	| { type: 'primary'; value: string }
	| { type: 'secondary'; value: string }
	| { type: 'tick'; value: number }
	| { type: 'token'; value: Token }

export interface KnownEvent {
	type: string
	parts: KnownEventPart[]
	note?: string
}

type TransactionLike = {
	to?: Address.Address | null
	input?: Hex.Hex | null | undefined
	data?: Hex.Hex | null | undefined
	calls?:
		| readonly {
				to?: Address.Address | null
				input?: Hex.Hex | null | undefined
				data?: Hex.Hex | null | undefined
		  }[]
		| null
}

type FeeManagerAddLiquidityCall =
	| {
			functionName: 'mint'
			args: readonly [
				Address.Address,
				Address.Address,
				bigint,
				bigint,
				Address.Address,
			]
	  }
	| {
			functionName: 'mintWithValidatorToken'
			args: readonly [Address.Address, Address.Address, bigint, Address.Address]
	  }

export function parseKnownEvents(
	receipt: TransactionReceipt,
	options?: { transaction?: TransactionLike },
): KnownEvent[] {
	const { logs } = receipt
	const events = parseEventLogs({ abi, logs })

	const feeManagerCall: FeeManagerAddLiquidityCall | undefined = (() => {
		const transaction = options?.transaction
		if (!transaction) return

		const callTarget = transaction.to ?? transaction.calls?.[0]?.to
		const callInput =
			transaction.input ??
			transaction.data ??
			transaction.calls?.[0]?.input ??
			transaction.calls?.[0]?.data
		if (!callTarget || !callInput) return
		if (!Address.isEqual(callTarget, FEE_MANAGER)) return

		try {
			const decoded = decodeFunctionData({
				abi: Abis.feeAmm,
				data: callInput as Hex.Hex,
			}) as DecodeFunctionDataReturnType<typeof Abis.feeAmm>

			if (
				decoded.functionName === 'mint' ||
				decoded.functionName === 'mintWithValidatorToken'
			)
				return decoded as FeeManagerAddLiquidityCall
		} catch {
			return undefined
		}
	})()

	const preferenceMap = new Map<string, string>()
	const feeTransferEvents: Array<{
		amount: bigint
		token: Address.Address
	}> = []

	for (const event of events) {
		let key: string | undefined

		// `TransferWithMemo` and `Transfer` events are paired with each other,
		// we will need to take preference on `TransferWithMemo` for those instances.
		if (event.eventName === 'TransferWithMemo') {
			const [_, from, to] = event.topics
			key = `${from}${to}`
		}

		// `Mint` and `Transfer` events are paired with each other,
		// we will need to take preference on `Mint` for those instances.
		if (event.eventName === 'Mint') {
			const [_, to] = event.topics
			key = `${event.address}${event.data}${to}`
		}

		// `Burn` and `Transfer` events are paired with each other,
		// we will need to take preference on `Burn` for those instances.
		if (event.eventName === 'Burn') {
			const [_, from] = event.topics
			key = `${event.address}${event.data}${from}`
		}

		if (key) preferenceMap.set(key, event.eventName)
	}

	const dedupedEvents = events.filter((event) => {
		let include = true

		if (event.eventName === 'Transfer') {
			{
				// Check TransferWithMemo dedup
				const [_, from, to] = event.topics
				const key = `${from}${to}`
				if (preferenceMap.get(key)?.includes('TransferWithMemo'))
					include = false
			}

			{
				// Check Mint dedup
				const [_, __, to] = event.topics
				const key = `${event.address}${event.data}${to}`
				if (preferenceMap.get(key)?.includes('Mint')) include = false
			}

			{
				// Check Burn dedup
				const [_, from] = event.topics
				const key = `${event.address}${event.data}${from}`
				if (preferenceMap.get(key)?.includes('Burn')) include = false
			}
		}

		return include
	})

	const knownEvents: KnownEvent[] = []

	if (
		feeManagerCall &&
		(feeManagerCall.functionName === 'mint' ||
			feeManagerCall.functionName === 'mintWithValidatorToken')
	) {
		const {
			userToken,
			validatorToken,
			amountUserToken,
			amountValidatorToken,
		}: {
			userToken: Address.Address
			validatorToken: Address.Address
			amountUserToken: bigint
			amountValidatorToken: bigint
		} =
			feeManagerCall.functionName === 'mint'
				? {
						userToken: feeManagerCall.args[0] as Address.Address,
						validatorToken: feeManagerCall.args[1] as Address.Address,
						amountUserToken: feeManagerCall.args[2] as bigint,
						amountValidatorToken: feeManagerCall.args[3] as bigint,
					}
				: {
						userToken: feeManagerCall.args[0] as Address.Address,
						validatorToken: feeManagerCall.args[1] as Address.Address,
						amountUserToken: 0n,
						amountValidatorToken: feeManagerCall.args[2] as bigint,
					}

		const parts: KnownEventPart[] = [
			{ type: 'action', value: 'Add Liquidity' },
			{
				type: 'amount',
				value: {
					value: amountUserToken,
					token: userToken as Address.Address,
				},
			},
			{ type: 'secondary', value: 'and' },
			{
				type: 'amount',
				value: {
					value: amountValidatorToken,
					token: validatorToken as Address.Address,
				},
			},
		]

		knownEvents.push({
			type: 'mint',
			parts,
		})
	}

	// Detect and group swap events (two transfers involving the stablecoin exchange)
	const swapIndices = new Set<number>()

	// Find all transfers in the events
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

	// Look for swap pairs (transfer TO exchange + transfer FROM exchange)
	for (let index = 0; index < transferEvents.length - 1; index++) {
		const { event: event1, index: idx1 } = transferEvents[index]
		// Type assertion is safe here because isTransferEvent has validated the structure
		const args1 = event1.args as TransferEventArgs
		const to1 = args1.to

		// If this is a transfer TO the exchange, look for a matching transfer FROM the exchange
		if (Address.isEqual(to1, STABLECOIN_EXCHANGE)) {
			for (
				let innerIndex = index + 1;
				innerIndex < transferEvents.length;
				innerIndex++
			) {
				const { event: event2, index: idx2 } = transferEvents[innerIndex]
				const args2 = event2.args as TransferEventArgs
				const from2 = args2.from

				if (Address.isEqual(from2, STABLECOIN_EXCHANGE)) {
					// This is a swap - create a single swap event
					knownEvents.push({
						type: 'swap',
						parts: [
							{ type: 'action', value: 'Swap' },
							{
								type: 'amount',
								value: {
									value: args1.amount,
									token: event1.address,
								},
							},
							{ type: 'secondary', value: 'for' },
							{
								type: 'amount',
								value: {
									value: args2.amount,
									token: event2.address,
								},
							},
						],
					})

					// Mark these events as processed
					swapIndices.add(idx1)
					swapIndices.add(idx2)
					break // Found the matching pair, move to next transfer
				}
			}
		}
	}

	// Map log events to known events.
	for (let index = 0; index < dedupedEvents.length; index++) {
		// Skip events that are part of a swap
		if (swapIndices.has(index)) continue

		const event = dedupedEvents[index]
		switch (event.eventName) {
			case 'TransferWithMemo':
			case 'Transfer': {
				const { amount, from, to } = event.args
				const isFee =
					Address.isEqual(to, FEE_MANAGER) &&
					!Address.isEqual(from, ZERO_ADDRESS)
				if (isFee) {
					// Store fee transfer info for later use if no other events exist
					feeTransferEvents.push({
						amount,
						token: event.address,
					})
					break
				}

				const memo =
					'memo' in event.args
						? Hex.toString(Hex.trimLeft(event.args.memo))
						: undefined

				knownEvents.push({
					type: 'send',
					note: memo,
					parts: [
						{ type: 'action', value: 'Send' },
						{
							type: 'amount',
							value: {
								value: amount,
								token: event.address,
							},
						},
						{ type: 'secondary', value: 'to' },
						{ type: 'account', value: to },
					],
				})
				break
			}

			case 'Mint': {
				// Handle token mint (TIP20)
				if (Address.isEqual(event.address, FEE_MANAGER)) break

				if ('amount' in event.args) {
					const { amount, to } = event.args

					knownEvents.push({
						type: 'mint',
						parts: [
							{ type: 'action', value: 'Mint' },
							{
								type: 'amount',
								value: {
									value: amount,
									token: event.address,
								},
							},
							{ type: 'secondary', value: 'to' },
							{ type: 'account', value: to },
						],
					})
					break
				}

				// Handle liquidity pool mint (StablecoinExchange)
				if (
					!Address.isEqual(event.address, FEE_MANAGER) &&
					'amountUserToken' in event.args &&
					'amountValidatorToken' in event.args
				) {
					const {
						amountUserToken,
						amountValidatorToken,
						userToken,
						validatorToken,
					} = event.args

					const userContributionPositive = amountUserToken > 0n
					const validatorContributionPositive = amountValidatorToken > 0n

					if (userContributionPositive && validatorContributionPositive) {
						knownEvents.push({
							type: 'mint',
							parts: [
								{ type: 'action', value: 'Add Liquidity' },
								{
									type: 'amount',
									value: {
										value: amountUserToken,
										token: userToken,
									},
								},
								{ type: 'secondary', value: 'and' },
								{
									type: 'amount',
									value: {
										value: amountValidatorToken,
										token: validatorToken,
									},
								},
							],
						})
						break
					}
				}

				break
			}

			case 'Burn': {
				if ('amount' in event.args) {
					const { amount, from } = event.args

					knownEvents.push({
						type: 'burn',
						parts: [
							{ type: 'action', value: 'Burn' },
							{
								type: 'amount',
								value: {
									value: amount,
									token: event.address,
								},
							},
							{ type: 'secondary', value: 'from' },
							{ type: 'account', value: from },
						],
					})
					break
				}

				break
			}

			case 'TokenCreated': {
				const { symbol } = event.args
				knownEvents.push({
					type: 'create token',
					parts: [
						{ type: 'action', value: 'Create Token' },
						{ type: 'token', value: { address: event.address, symbol } },
					],
				})
				break
			}

			case 'RoleMembershipUpdated': {
				const { account, hasRole, role } = event.args
				knownEvents.push({
					type: hasRole ? 'grant role' : 'revoke role',
					parts: [
						{ type: 'action', value: hasRole ? 'Grant Role' : 'Revoke Role' },
						{ type: 'hex', value: role },
						{ type: 'secondary', value: 'to' },
						{ type: 'account', value: account },
					],
				})
				break
			}
		}
	}

	// If no known events were parsed but there was a fee transfer,
	// show it as a fee payment event
	if (knownEvents.length === 0 && feeTransferEvents.length > 0) {
		const parts: KnownEventPart[] = [{ type: 'action', value: 'Pay Fee' }]

		for (const [index, fee] of feeTransferEvents.entries()) {
			if (index > 0) parts.push({ type: 'secondary', value: 'and' })
			parts.push({
				type: 'amount',
				value: {
					value: fee.amount,
					token: fee.token,
				},
			})
		}

		knownEvents.push({
			type: 'fee',
			parts,
		})
	}

	return knownEvents
}
