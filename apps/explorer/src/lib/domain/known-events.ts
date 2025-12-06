import { Address, Hex } from 'ox'
import { Abis, Addresses } from 'tempo.ts/viem'
import {
	type AbiEvent,
	decodeFunctionData,
	type Log,
	parseEventLogs,
	type TransactionReceipt,
	zeroAddress,
} from 'viem'
import type * as Tip20 from './tip20'

const abi = Object.values(Abis).flat()
const ZERO_ADDRESS = zeroAddress
const FEE_MANAGER = Addresses.feeManager
const STABLECOIN_EXCHANGE = Addresses.stablecoinExchange

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

function createDetectors(
	createAmount: (value: bigint, token: Address.Address) => Amount,
	getTokenMetadata?: Tip20.GetTip20MetadataFn,
	mintBurnMemos?: Map<string, string>,
) {
	return {
		tip20(event: ParsedEvent) {
			const { eventName, args, address } = event

			if (eventName === 'Transfer' || eventName === 'TransferWithMemo')
				return Address.isEqual(args.to, FEE_MANAGER) &&
					!Address.isEqual(args.from, ZERO_ADDRESS)
					? {
							type: 'fee transfer',
							amount: args.amount,
							token: address,
						}
					: {
							type: 'send',
							note:
								'memo' in args
									? Hex.toString(Hex.trimLeft(args.memo))
									: undefined,
							parts: [
								{ type: 'action', value: 'Send' },
								{
									type: 'amount',
									value: createAmount(args.amount, address),
								},
								{ type: 'text', value: 'to' },
								{ type: 'account', value: args.to },
							],
							meta: { from: args.from, to: args.to },
						}

			if (eventName === 'Mint') {
				// Only handle TIP20 token mint, not liquidity pool mint
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
						{
							type: 'amount',
							value: createAmount(amount, address),
						},
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
						{
							type: 'amount',
							value: createAmount(amount, address),
						},
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
						{ type: 'hex', value: args.role },
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

			if (eventName === 'SupplyCapUpdate') {
				const metadata = getTokenMetadata?.(address)
				return {
					type: 'supply cap update',
					parts: [
						{ type: 'action', value: 'Supply Cap Update' },
						{ type: 'text', value: 'for' },
						{
							type: 'token',
							value: { address, symbol: metadata?.symbol },
						},
					],
					note: [
						[
							'New',
							{
								type: 'number',
								value:
									metadata?.decimals === undefined
										? args.newSupplyCap
										: [args.newSupplyCap, metadata.decimals],
							},
						],
					],
				}
			}

			if (eventName === 'RewardScheduled') {
				const metadata = getTokenMetadata?.(address)
				return {
					type: 'reward scheduled',
					parts: [
						{ type: 'action', value: 'Reward Stream' },
						{ type: 'text', value: 'created for' },
						{
							type: 'token',
							value: { address, symbol: metadata?.symbol },
						},
					],
					note: [
						['ID', { type: 'text', value: String(args.id) }],
						['Funder', { type: 'account', value: args.funder }],
						[
							'Amount',
							{
								type: 'number',
								value:
									metadata?.decimals === undefined
										? args.amount
										: [args.amount, metadata.decimals],
							},
						],
						['Duration', { type: 'duration', value: args.durationSeconds }],
					],
				}
			}

			if (eventName === 'RewardCanceled') {
				const metadata = getTokenMetadata?.(address)
				return {
					type: 'reward canceled',
					parts: [
						{ type: 'action', value: 'Cancel Reward Stream' },
						{ type: 'text', value: 'for' },
						{
							type: 'token',
							value: { address, symbol: metadata?.symbol },
						},
					],
					note: [
						['ID', { type: 'text', value: String(args.id) }],
						['Funder', { type: 'account', value: args.funder }],
						[
							'Refund',
							{
								type: 'number',
								value:
									metadata?.decimals === undefined
										? args.refund
										: [args.refund, metadata.decimals],
							},
						],
					],
				}
			}

			if (eventName === 'RewardRecipientSet')
				return {
					type: 'reward recipient set',
					parts: [
						{ type: 'action', value: 'Set Reward Recipient' },
						{ type: 'account', value: args.recipient },
						{ type: 'text', value: 'for holder' },
						{ type: 'account', value: args.holder },
					],
				}

			if (eventName === 'Approval')
				return {
					type: 'approval',
					parts: [
						{ type: 'action', value: 'Approve' },
						{
							type: 'amount',
							value: createAmount(args.amount, address),
						},
						{ type: 'text', value: 'for spender' },
						{ type: 'account', value: args.spender },
					],
				}

			if (eventName === 'BurnBlocked')
				return {
					type: 'burn blocked',
					parts: [
						{ type: 'action', value: 'Burn Blocked' },
						{
							type: 'amount',
							value: createAmount(args.amount, address),
						},
						{ type: 'text', value: 'from' },
						{ type: 'account', value: args.from },
					],
				}

			if (eventName === 'TransferPolicyUpdate')
				return {
					type: 'transfer policy update',
					parts: [
						{ type: 'action', value: 'Update Transfer Policy' },
						{ type: 'text', value: `#${args.newPolicyId}` },
						{ type: 'text', value: 'for' },
						{ type: 'token', value: { address } },
					],
					note: [['Updater', { type: 'account', value: args.updater }]],
				}

			if (eventName === 'NextQuoteTokenSet') {
				const metadata = getTokenMetadata?.(address)
				return {
					type: 'next quote token set',
					parts: [
						{ type: 'action', value: 'Set Next Quote Token' },
						{ type: 'token', value: { address: args.nextQuoteToken } },
						{ type: 'text', value: 'for' },
						{
							type: 'token',
							value: { address, symbol: metadata?.symbol },
						},
					],
					note: [['Updater', { type: 'account', value: args.updater }]],
				}
			}

			if (eventName === 'QuoteTokenUpdate') {
				const metadata = getTokenMetadata?.(address)
				return {
					type: 'quote token update',
					parts: [
						{ type: 'action', value: 'Update Quote Token' },
						{ type: 'token', value: { address: args.newQuoteToken } },
						{ type: 'text', value: 'for' },
						{
							type: 'token',
							value: { address, symbol: metadata?.symbol },
						},
					],
					note: [['Updater', { type: 'account', value: args.updater }]],
				}
			}

			if (eventName === 'RoleAdminUpdated')
				return {
					type: 'role admin updated',
					parts: [
						{ type: 'action', value: 'Update Role Admin' },
						{ type: 'hex', value: args.role },
						{ type: 'text', value: 'to' },
						{ type: 'hex', value: args.newAdminRole },
					],
					note: [['Sender', { type: 'account', value: args.sender }]],
				}

			return null
		},

		tip20Factory(event: ParsedEvent) {
			const { eventName, args, address } = event

			if (eventName === 'TokenCreated')
				return {
					type: 'create token',
					parts: [
						{ type: 'action', value: 'Create Token' },
						{ type: 'token', value: { address, symbol: args.symbol } },
					],
				}

			return null
		},

		stablecoinExchange(event: ParsedEvent) {
			const { eventName, args, address } = event

			if (eventName === 'Mint')
				return !Address.isEqual(address, FEE_MANAGER) &&
					'amountUserToken' in args &&
					'amountValidatorToken' in args &&
					args.amountUserToken > 0n &&
					args.amountValidatorToken > 0n
					? {
							type: 'mint',
							parts: [
								{ type: 'action', value: 'Add Liquidity' },
								{
									type: 'amount',
									value: createAmount(args.amountUserToken, args.userToken),
								},
								{ type: 'text', value: 'and' },
								{
									type: 'amount',
									value: createAmount(
										args.amountValidatorToken,
										args.validatorToken,
									),
								},
							],
						}
					: null

			if (eventName === 'OrderPlaced')
				return {
					type: 'order placed',
					parts: [
						{ type: 'action', value: `Limit ${args.isBid ? 'Buy' : 'Sell'}` },
						{
							type: 'amount',
							value: createAmount(args.amount, args.token),
						},
						{ type: 'text', value: 'at tick' },
						{ type: 'tick', value: args.tick },
					],
				}

			if (eventName === 'FlipOrderPlaced')
				return {
					type: 'flip order placed',
					parts: [
						{ type: 'action', value: `Flip ${args.isBid ? 'Buy' : 'Sell'}` },
						{
							type: 'amount',
							value: createAmount(args.amount, args.token),
						},
						{ type: 'text', value: 'at tick' },
						{ type: 'tick', value: args.tick },
					],
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

			if (eventName === 'PairCreated')
				return {
					type: 'create pair',
					parts: [
						{ type: 'action', value: 'Create Pair' },
						{ type: 'token', value: { address: args.base } },
						{ type: 'text', value: '/' },
						{ type: 'token', value: { address: args.quote } },
					],
				}

			return null
		},

		tip403Registry(event: ParsedEvent) {
			const { eventName, args } = event

			if (eventName === 'WhitelistUpdated')
				return {
					type: 'whitelist',
					parts: [
						{ type: 'action', value: 'Whitelist' },
						{ type: 'account', value: args.account },
						{ type: 'text', value: 'on Policy' },
						{ type: 'text', value: `#${args.policyId}` },
					],
				}

			if (eventName === 'BlacklistUpdated')
				return {
					type: 'blacklist',
					parts: [
						{ type: 'action', value: 'Blacklist' },
						{ type: 'account', value: args.account },
						{ type: 'text', value: 'on Policy' },
						{ type: 'text', value: `#${args.policyId}` },
					],
				}

			if (eventName === 'PolicyAdminUpdated')
				return {
					type: 'policy admin updated',
					parts: [
						{ type: 'action', value: 'New Admin' },
						{ type: 'account', value: args.admin },
						{ type: 'text', value: 'on Policy' },
						{ type: 'text', value: `#${args.policyId}` },
					],
					note: [
						// ['Registry', { type: 'account', value: TODO }],
						['Updater', { type: 'account', value: args.updater }],
					],
				}

			if (eventName === 'PolicyCreated')
				return {
					type: 'policy created',
					parts: [
						{ type: 'action', value: 'Create Policy' },
						{ type: 'text', value: `#${args.policyId}` },
					],
				}

			return null
		},

		feeManager(event: ParsedEvent) {
			const { eventName, args } = event

			if (eventName === 'UserTokenSet')
				return {
					type: 'user token set',
					parts: [
						{ type: 'action', value: 'Set Fee Token' },
						{ type: 'token', value: { address: args.token } },
						{ type: 'text', value: 'for' },
						{ type: 'account', value: args.user },
					],
				}

			if (eventName === 'ValidatorTokenSet')
				return {
					type: 'validator token set',
					parts: [
						{ type: 'action', value: 'Set Fee Token' },
						{ type: 'token', value: { address: args.token } },
						{ type: 'text', value: 'for' },
						{ type: 'account', value: args.validator },
					],
				}

			return null
		},

		nonce(event: ParsedEvent) {
			const { eventName, args } = event

			if (eventName === 'NonceIncremented')
				return {
					type: 'nonce incremented',
					parts: [
						{ type: 'action', value: 'Increment Nonce' },
						{ type: 'account', value: args.account },
					],
					note: [
						['Key', { type: 'text', value: String(args.nonceKey) }],
						['New Nonce', { type: 'text', value: String(args.newNonce) }],
					],
				}

			if (eventName === 'ActiveKeyCountChanged')
				return {
					type: 'active key count changed',
					parts: [
						{ type: 'action', value: 'Key Count Changed' },
						{ type: 'account', value: args.account },
					],
					note: [['New Count', { type: 'text', value: String(args.newCount) }]],
				}

			return null
		},

		feeAmm(event: ParsedEvent) {
			const { eventName, args, address } = event

			if (eventName === 'Mint')
				return !Address.isEqual(address, FEE_MANAGER) &&
					'amountUserToken' in args &&
					'amountValidatorToken' in args
					? {
							type: 'mint',
							parts: [
								{ type: 'action', value: 'Add Liquidity' },
								{
									type: 'amount',
									value: createAmount(args.amountUserToken, args.userToken),
								},
								{ type: 'text', value: 'and' },
								{
									type: 'amount',
									value: createAmount(
										args.amountValidatorToken,
										args.validatorToken,
									),
								},
							],
						}
					: null

			if (eventName === 'Burn')
				return 'amountUserToken' in args && 'amountValidatorToken' in args
					? {
							type: 'burn',
							parts: [
								{ type: 'action', value: 'Remove Liquidity' },
								{
									type: 'amount',
									value: createAmount(args.amountUserToken, args.userToken),
								},
								{ type: 'text', value: 'and' },
								{
									type: 'amount',
									value: createAmount(
										args.amountValidatorToken,
										args.validatorToken,
									),
								},
							],
						}
					: null

			if (eventName === 'RebalanceSwap')
				return {
					type: 'rebalance swap',
					parts: [
						{ type: 'action', value: 'Rebalance Swap' },
						{
							type: 'amount',
							value: createAmount(args.amountIn, args.userToken),
						},
						{ type: 'text', value: 'for' },
						{
							type: 'amount',
							value: createAmount(args.amountOut, args.validatorToken),
						},
					],
				}

			if (eventName === 'FeeSwap')
				return {
					type: 'fee swap',
					parts: [
						{ type: 'action', value: 'Fee Swap' },
						{
							type: 'amount',
							value: createAmount(args.amountIn, args.userToken),
						},
						{ type: 'text', value: 'for' },
						{
							type: 'amount',
							value: createAmount(args.amountOut, args.validatorToken),
						},
					],
				}

			return null
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
	| { type: 'duration'; value: number } // in seconds
	| { type: 'hex'; value: Hex.Hex }
	| {
			type: 'number'
			value: bigint | number | [value: bigint, decimals: number]
	  }
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
	options?: {
		transaction?: TransactionLike
		getTokenMetadata?: Tip20.GetTip20MetadataFn
	},
): KnownEvent[] {
	const { logs } = receipt
	const events = parseEventLogs({ abi, logs })
	const getTokenMetadata = options?.getTokenMetadata

	const createAmount = (value: bigint, token: Address.Address): Amount => {
		const metadata = getTokenMetadata?.(token)
		const amount: Amount = { token, value }
		if (metadata) {
			amount.decimals = metadata.decimals
			amount.symbol = metadata.symbol
		}
		return amount
	}

	const feeManagerCall: FeeManagerAddLiquidityCall | undefined = (() => {
		const transaction = options?.transaction
		if (!transaction) return

		const queue: TransactionLike[] = [transaction]

		while (queue.length > 0) {
			const call = queue.shift()
			if (!call) break

			const callTarget = call.to
			const callInput = call.input ?? call.data

			if (callTarget && callInput && Address.isEqual(callTarget, FEE_MANAGER))
				try {
					const decoded = decodeFunctionData({
						abi: Abis.feeAmm,
						data: callInput,
					})

					/**
					 * @note
					 * `Transfer` logs alone can't distinguish "Add Liquidity" from fee collection,
					 * since both send tokens to the `FeeManager`. Decoding `calldata` is the only way
					 * to catch explicit user mints. If the `FeeManager` starts emitting a dedicated event,
					 * we can revisit this and simplify the logic.
					 */
					if (
						decoded.functionName === 'mint' ||
						decoded.functionName === 'mintWithValidatorToken'
					)
						return decoded
				} catch {
					// fall through and continue searching other calls
				}

			if (call.calls) queue.push(...call.calls)
		}
	})()

	const preferenceMap = new Map<string, string>()
	const feeTransferEvents: Array<{
		amount: bigint
		token: Address.Address
	}> = []

	// Map to store memos from TransferWithMemo events that pair with Mint/Burn
	// Key format: `${token}:${amount}:${address}` where address is `to` for Mint, `from` for Burn
	const mintBurnMemos = new Map<string, string>()

	for (const event of events) {
		let key: string | undefined

		// `TransferWithMemo` and `Transfer` events are paired with each other,
		// we will need to take preference on `TransferWithMemo` for those instances.
		if (event.eventName === 'TransferWithMemo') {
			const [_, from, to] = event.topics
			key = `${from}${to}`
		}

		// `Mint` and `Transfer`/`TransferWithMemo` events are paired with each other,
		// we will need to take preference on `Mint` for those instances.
		if (event.eventName === 'Mint' && 'amount' in event.args) {
			const { amount, to } = event.args as {
				amount: bigint
				to: Address.Address
			}
			key = `mint:${event.address}:${amount}:${to}`
		}

		// `Burn` and `Transfer`/`TransferWithMemo` events are paired with each other,
		// we will need to take preference on `Burn` for those instances.
		if (event.eventName === 'Burn' && 'amount' in event.args) {
			const { amount, from } = event.args as {
				amount: bigint
				from: Address.Address
			}
			key = `burn:${event.address}:${amount}:${from}`
		}

		if (key) preferenceMap.set(key, event.eventName)
	}

	// Second pass: collect memos from TransferWithMemo events that pair with Mint/Burn
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

			// Check if this pairs with a Mint (transfer from zero address)
			if (Address.isEqual(from, ZERO_ADDRESS)) {
				const mintKey = `mint:${event.address}:${amount}:${to}`
				if (preferenceMap.get(mintKey) === 'Mint') {
					mintBurnMemos.set(mintKey, memoText)
				}
			}

			// Check if this pairs with a Burn (transfer to zero address)
			if (Address.isEqual(to, ZERO_ADDRESS)) {
				const burnKey = `burn:${event.address}:${amount}:${from}`
				if (preferenceMap.get(burnKey) === 'Burn') {
					mintBurnMemos.set(burnKey, memoText)
				}
			}
		}
	}

	// Create detectors after mintBurnMemos is populated so they can access the memos
	const detectors = createDetectors(
		createAmount,
		getTokenMetadata,
		mintBurnMemos,
	)

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
			// Check Mint dedup (transfer from zero address)
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
				if (Address.isEqual(from, ZERO_ADDRESS)) {
					const mintKey = `mint:${event.address}:${amount}:${to}`
					if (preferenceMap.get(mintKey) === 'Mint') include = false
				}
			}
			// Check Burn dedup (transfer to zero address)
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
				if (Address.isEqual(to, ZERO_ADDRESS)) {
					const burnKey = `burn:${event.address}:${amount}:${from}`
					if (preferenceMap.get(burnKey) === 'Burn') include = false
				}
			}
		}

		// Also filter out TransferWithMemo events that pair with Mint/Burn
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

				// Check Mint dedup (transfer from zero address)
				if (Address.isEqual(from, ZERO_ADDRESS)) {
					const mintKey = `mint:${event.address}:${amount}:${to}`
					if (preferenceMap.get(mintKey) === 'Mint') include = false
				}

				// Check Burn dedup (transfer to zero address)
				if (Address.isEqual(to, ZERO_ADDRESS)) {
					const burnKey = `burn:${event.address}:${amount}:${from}`
					if (preferenceMap.get(burnKey) === 'Burn') include = false
				}
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
						userToken: feeManagerCall.args[0],
						validatorToken: feeManagerCall.args[1],
						amountUserToken: feeManagerCall.args[2],
						amountValidatorToken: feeManagerCall.args[3],
					}
				: {
						userToken: feeManagerCall.args[0],
						validatorToken: feeManagerCall.args[1],
						amountUserToken: 0n,
						amountValidatorToken: feeManagerCall.args[2],
					}

		const parts: KnownEventPart[] = [
			{ type: 'action', value: 'Add Liquidity' },
			{
				type: 'amount',
				value: createAmount(amountUserToken, userToken),
			},
			{ type: 'text', value: 'and' },
			{
				type: 'amount',
				value: createAmount(amountValidatorToken, validatorToken),
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
		const args1 = event1.args
		const to1 = args1.to

		// If this is a transfer TO the exchange, look for a matching transfer FROM the exchange
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
					// This is a swap - create a single swap event
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

		const detected =
			detectors.tip20(event) ||
			detectors.tip20Factory(event) ||
			detectors.stablecoinExchange(event) ||
			detectors.tip403Registry(event) ||
			detectors.feeManager(event) ||
			detectors.nonce(event) ||
			detectors.feeAmm(event)

		if (!detected) continue

		if (isFeeTransferEvent(detected)) {
			feeTransferEvents.push(detected)
			continue
		}

		knownEvents.push(detected)
	}

	// If no known events were parsed but there was a fee transfer,
	// show it as a fee payment event
	if (knownEvents.length === 0 && feeTransferEvents.length > 0) {
		const parts: KnownEventPart[] = [{ type: 'action', value: 'Pay Fee' }]

		for (const [index, fee] of feeTransferEvents.entries()) {
			if (index > 0) parts.push({ type: 'text', value: 'and' })
			parts.push({
				type: 'amount',
				value: createAmount(fee.amount, fee.token),
			})
		}

		knownEvents.push({
			type: 'fee',
			parts,
		})
	}

	return knownEvents
}
