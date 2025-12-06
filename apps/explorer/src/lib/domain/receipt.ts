import { Address, Hex } from 'ox'
import { TokenRole } from 'tempo.ts/ox'
import { Abis, Addresses } from 'tempo.ts/viem'
import {
	type AbiEvent,
	type Log,
	parseEventLogs,
	type TransactionReceipt,
	zeroAddress,
} from 'viem'
import type * as Tip20 from '#lib/domain/tip20'
import { HexFormatter, PriceFormatter } from '#lib/formatting'

const abi = Object.values(Abis).flat()

export type FeeBreakdownItem = {
	amount: bigint
	currency: string
	decimals: number
	symbol?: string
	token?: Address.Address
	payer?: Address.Address
}

export function getFeeBreakdown(
	receipt: TransactionReceipt,
	{ getTokenMetadata }: { getTokenMetadata: Tip20.GetTip20MetadataFn },
): FeeBreakdownItem[] {
	const { logs } = receipt

	const events = parseEventLogs({ abi, logs })
	const feeBreakdown: FeeBreakdownItem[] = []

	for (const event of events) {
		if (
			event.eventName !== 'Transfer' &&
			event.eventName !== 'TransferWithMemo'
		)
			continue

		const { amount, from, to } = event.args
		const token = event.address

		const isFee =
			Address.isEqual(to, Addresses.feeManager) &&
			!Address.isEqual(from, zeroAddress)

		if (!isFee) continue

		const metadata = getTokenMetadata(token)
		if (!metadata) continue

		const { currency, decimals, symbol } = metadata

		feeBreakdown.push({
			amount,
			currency,
			decimals,
			symbol,
			token,
			payer: Address.checksum(from),
		})
	}

	return feeBreakdown
}

export namespace LineItems {
	export type Result = {
		main: LineItem.LineItem[]
		feeTotals: LineItem.LineItem[]
		totals: LineItem.LineItem[]
		feeBreakdown: LineItem.FeeBreakdownItem[]
	}

	export function fromReceipt(
		receipt: TransactionReceipt,
		{ getTokenMetadata }: { getTokenMetadata: Tip20.GetTip20MetadataFn },
	) {
		const { from: sender, logs } = receipt
		const senderChecksum = Address.checksum(sender)

		// Extract all of the event logs we can from the receipt.
		const events = parseEventLogs({
			abi,
			logs,
		})

		////////////////////////////////////////////////////////////

		const preferenceMap = new Map<string, string>()

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

		////////////////////////////////////////////////////////////

		const items: Result = {
			main: [],
			feeTotals: [],
			totals: [],
			feeBreakdown: [],
		}
		const feeEvents: LineItem.LineItem[] = []

		// Map log events to receipt line items.
		for (const event of dedupedEvents) {
			switch (event.eventName) {
				case 'Burn': {
					if ('amount' in event.args) {
						const { amount, from } = event.args

						const metadata = getTokenMetadata(event.address)
						if (!metadata) {
							items.main.push(LineItem.noop(event))
							break
						}

						const { currency, decimals, symbol } = metadata

						const isSelf = Address.isEqual(from, sender)

						items.main.push(
							LineItem.from({
								event,
								price: isSelf
									? {
											amount,
											currency,
											decimals,
											symbol,
											token: event.address,
										}
									: undefined,
								ui: {
									bottom: [
										{
											left: `From: ${HexFormatter.truncate(from)}`,
										},
									],
									left: `Burn ${symbol}`,
									right: decimals
										? PriceFormatter.format(amount, decimals)
										: '-',
								},
							}),
						)
						break
					}

					items.main.push(LineItem.noop(event))
					break
				}

				case 'RoleMembershipUpdated': {
					const { account, hasRole, role } = event.args

					const roleName =
						TokenRole.roles.find((r) => TokenRole.serialize(r) === role) ??
						undefined

					items.main.push(
						LineItem.from({
							event,
							position: 'main',
							ui: {
								bottom: [
									{
										left: `To: ${HexFormatter.truncate(account)}`,
									},
									{
										left: `Role: ${roleName}`,
									},
								],
								left: `${roleName ? `${roleName} ` : ' '}Role ${hasRole ? 'Granted' : 'Revoked'}`,
								right: '-',
							},
						}),
					)
					break
				}

				case 'Mint': {
					if ('amount' in event.args) {
						const metadata = getTokenMetadata(event.address)
						if (!metadata) {
							items.main.push(LineItem.noop(event))
							break
						}

						const { decimals } = metadata
						const { amount, to } = event.args

						items.main.push(
							LineItem.from({
								event,
								ui: {
									bottom: [
										{
											left: `To: ${HexFormatter.truncate(to)}`,
										},
									],
									left: `Mint ${metadata?.symbol ? ` ${metadata.symbol}` : ''}`,
									right: decimals
										? `(${PriceFormatter.format(amount, decimals)})`
										: '',
								},
							}),
						)
						break
					}

					items.main.push(LineItem.noop(event))
					break
				}

				case 'TokenCreated': {
					const { symbol } = event.args
					items.main.push(
						LineItem.from({
							event,
							ui: {
								left: `Create Token (${symbol})`,
								right: '-',
							},
						}),
					)
					break
				}

				case 'TransferWithMemo':
				case 'Transfer': {
					const { amount, from, to } = event.args
					const token = event.address

					const metadata = getTokenMetadata(token)
					if (!metadata) {
						items.main.push(LineItem.noop(event))
						break
					}

					const isCredit = Address.isEqual(to, sender)
					const memo =
						'memo' in event.args
							? Hex.toString(Hex.trimLeft(event.args.memo))
							: undefined

					const { currency, decimals, symbol } = metadata

					const isFee =
						Address.isEqual(to, Addresses.feeManager) &&
						!Address.isEqual(from, zeroAddress)

					if (isFee) {
						const feePayer = !Address.isEqual(from, senderChecksum) ? from : ''

						const feeLineItem = LineItem.from({
							event,
							isFee,
							price: {
								amount,
								currency,
								decimals,
								symbol,
								token,
							},
							ui: {
								left: `${symbol} ${feePayer ? `(PAID BY ${HexFormatter.truncate(feePayer)})` : ''}`,
								right: decimals ? PriceFormatter.format(amount, decimals) : '-',
							},
						})
						feeEvents.push(feeLineItem)
						items.feeBreakdown.push({
							amount,
							currency,
							decimals,
							symbol,
							token,
							payer: Address.checksum(from),
						})
						break
					}

					items.main.push(
						LineItem.from({
							event,
							price: {
								amount: isCredit ? -amount : amount,
								currency,
								decimals,
								symbol,
								token,
							},
							ui: {
								bottom: [...(memo ? [{ left: `Memo: ${memo}` }] : [])],
								left: `Send ${symbol} ${to ? `to ${HexFormatter.truncate(to)}` : ''}`,
								right: decimals
									? PriceFormatter.format(isCredit ? -amount : amount, decimals)
									: '-',
							},
						}),
					)
					break
				}

				default: {
					items.main.push(LineItem.noop(event))
				}
			}
		}

		////////////////////////////////////////////////////////////

		// Calculate fee totals grouped by currency -> symbol
		type Currency = string
		type Symbol = string
		const feeTotals = new Map<
			Currency,
			{
				amount: bigint
				decimals: number
				tokens: Map<Symbol, LineItem.LineItem['price']>
			}
		>()
		for (const item of feeEvents) {
			if (!item.isFee) continue

			const { price } = item
			if (!price) continue

			const { amount, currency, decimals, symbol, token } = price
			if (!currency) continue
			if (!decimals) continue
			if (!symbol) continue

			let currencyMap = feeTotals.get(currency)
			currencyMap ??= {
				amount: 0n,
				decimals,
				tokens: new Map(),
			}

			const existing = currencyMap.tokens.get(symbol)
			if (existing) existing.amount += amount
			else currencyMap.tokens.set(symbol, { amount, currency, decimals, token })

			currencyMap.amount += amount

			feeTotals.set(currency, currencyMap)
		}

		// Add fee totals to line items
		for (const [currency, { amount, decimals }] of feeTotals)
			items.feeTotals.push(
				LineItem.from({
					position: 'end',
					price: {
						amount,
						decimals,
						currency,
					},
					ui: {
						left: 'Fee',
						right: decimals
							? PriceFormatter.format(amount, { decimals, format: 'short' })
							: '-',
					},
				}),
			)

		// Calculate totals grouped by currency
		const totals = new Map<string, LineItem.LineItem['price']>()
		for (const item of [...items.main, ...items.feeTotals]) {
			if (!('price' in item)) continue

			const { price } = item
			if (!price) continue

			const existing = totals.get(price.currency)
			if (existing) existing.amount += price.amount
			else totals.set(price.currency, price)
		}

		// Add totals to line items
		for (const [_, price] of totals) {
			if (!price) continue
			const { amount, decimals } = price
			const formatted = decimals
				? PriceFormatter.format(amount, { decimals, format: 'short' })
				: '-'
			items.totals.push(
				LineItem.from({
					price,
					ui: {
						left: 'Total',
						right: formatted,
					},
				}),
			)
		}

		return items
	}
}

export namespace LineItem {
	export type LineItem = {
		/**
		 * Event log emitted.
		 */
		event?: Log<bigint, number, boolean, AbiEvent> | undefined
		/**
		 * Whether the line item is a fee item.
		 */
		isFee?: boolean | undefined
		/**
		 * Grouping key.
		 */
		key?: string | undefined
		/**
		 * Price of the line item.
		 */
		price?:
			| {
					/**
					 * Amount in units of the token.
					 */
					amount: bigint
					/**
					 * Currency of the token.
					 */
					currency: string
					/**
					 * Decimals of the token.
					 */
					decimals: number
					/**
					 * Symbol of the token.
					 */
					symbol?: string | undefined
					/**
					 * Address of the TIP20 token.
					 */
					token?: Address.Address | undefined
			  }
			| undefined
		/**
		 * UI data of the line item.
		 */
		ui: {
			/**
			 * Bottom data of the line item.
			 */
			bottom?:
				| {
						/**
						 * Left text of the line item.
						 */
						left: string
						/**
						 * Right text of the line item.
						 */
						right?: string | undefined
				  }[]
				| undefined
			/**
			 * Left text of the line item.
			 */
			left: string
			/**
			 * Right text of the line item.
			 */
			right: string
		}
	}

	export type FeeBreakdownItem = {
		amount: bigint
		currency: string
		decimals: number
		symbol?: string
		token?: Address.Address
		payer?: Address.Address
	}

	export function from<const item extends LineItem>(
		item: item,
	): item & {
		eventName: item['event'] extends { eventName: infer eventName }
			? eventName
			: undefined
	} {
		return {
			...item,
			eventName: item.event?.eventName,
		} as never
	}

	export function noop(event: Log<bigint, number, boolean, AbiEvent>) {
		return LineItem.from({
			event,
			position: 'main',
			ui: {
				left: event.eventName,
				right: '-',
			},
		})
	}
}
