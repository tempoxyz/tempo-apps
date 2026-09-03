import * as Address from 'ox/Address'
import * as Value from 'ox/Value'
import type { TransactionReceipt } from 'viem'
import type { FeeBreakdownItem, LineItems } from '#lib/domain/receipt'
import type { KnownEvent } from '#lib/domain/known-events'
import {
	calculateKnownEventsTotal,
	hasNonAdditiveVaultActivity,
} from '#lib/domain/known-event-totals'
import { isNonceIncrementedEvent } from '#lib/domain/transaction-activities'
import { PriceFormatter } from '#lib/formatting'
import {
	areUsdPricedTokens,
	hasTokenAmount,
	isUsdPricedToken,
} from '#lib/pricing'

const RECEIVE_POLICY_GUARD = Address.from(
	'0xB10C000000000000000000000000000000000000',
)

const PRIVATE_ZONE_ACTIONS = new Set([
	'Private Zone Deposit',
	'Private Zone Withdrawal',
])

export type ReceiptVoucher = {
	packetSize: number
	packetCount: number
}

type IsTokenListed = (
	chainId: number,
	address: Address.Address | undefined,
) => boolean

type ReceiptPresentationParams = {
	chainId: number
	feeBreakdown: FeeBreakdownItem[]
	feeToken: Address.Address | undefined
	isTokenListed: IsTokenListed
	knownEvents: KnownEvent[]
	lineItems: Pick<LineItems.Result, 'feeTotals' | 'totals'>
	receipt: Pick<TransactionReceipt, 'effectiveGasPrice' | 'from' | 'gasUsed'>
	voucher: ReceiptVoucher | null
}

export type ReceiptPresentation = {
	events: KnownEvent[]
	fee: number
	feeBreakdown: Array<FeeBreakdownItem & { display: string }>
	feeDisplay: string
	total?: number
	totalDisplay?: string
}

export function buildReceiptPresentation(
	params: ReceiptPresentationParams,
): ReceiptPresentation {
	const events = getReceiptDisplayEvents(
		params.knownEvents,
		params.voucher,
		params.feeToken,
	)
	const feeBreakdown = params.feeBreakdown
		.filter(
			(item) =>
				!item.payer ||
				item.payer.toLowerCase() === params.receipt.from.toLowerCase(),
		)
		.map((item) => ({
			...item,
			display:
				hasTokenAmount(item) &&
				isUsdPricedToken(params.chainId, item, params.isTokenListed)
					? PriceFormatter.format(item.amount, {
							decimals: item.decimals,
							format: 'short',
						})
					: PriceFormatter.formatAmountShort(
							Value.format(item.amount, item.decimals),
						),
		}))
	const feePrice = params.lineItems.feeTotals[0]?.price
	const previousFee = feePrice
		? Number(Value.format(feePrice.amount, feePrice.decimals))
		: 0
	const totalPrice = params.lineItems.totals[0]?.price
	const previousTotal = totalPrice
		? Number(Value.format(totalPrice.amount, totalPrice.decimals))
		: undefined
	const fallbackFeeAmount =
		params.receipt.effectiveGasPrice * params.receipt.gasUsed
	const feeRaw = feePrice
		? Value.format(feePrice.amount, feePrice.decimals)
		: Value.format(fallbackFeeAmount, 18)
	const fee = Number(feeRaw)
	const feeTokens = feeBreakdown.filter(hasTokenAmount)
	const showUsdFeePrefix =
		feeTokens.length > 0
			? areUsdPricedTokens(params.chainId, feeTokens, params.isTokenListed)
			: params.feeToken
				? params.isTokenListed(params.chainId, params.feeToken)
				: true
	const feeDisplay = showUsdFeePrefix
		? PriceFormatter.format(fee)
		: PriceFormatter.formatAmountShort(feeRaw)

	const streamingTotal = params.voucher
		? params.voucher.packetSize * params.voucher.packetCount
		: undefined
	const eventsTotal = calculateKnownEventsTotal(events)
	const eventsTotalDisplayValue =
		eventsTotal > 0n ? Number(Value.format(eventsTotal, 18)) : undefined
	const eventTotalTokens = getKnownEventAmounts(events)
	const total =
		streamingTotal !== undefined
			? streamingTotal
			: eventsTotalDisplayValue !== undefined
				? eventsTotalDisplayValue + fee
				: previousTotal !== undefined
					? previousTotal - previousFee + fee
					: fee
	const totalTokens = params.lineItems.totals
		.map((item) => item.price)
		.filter(hasTokenAmount)
	const showUsdTotalPrefix = (() => {
		if (streamingTotal !== undefined) return true
		if (eventsTotalDisplayValue !== undefined) {
			return areUsdPricedTokens(
				params.chainId,
				eventTotalTokens,
				params.isTokenListed,
			)
		}
		if (totalTokens.length > 0) {
			return areUsdPricedTokens(
				params.chainId,
				totalTokens,
				params.isTokenListed,
			)
		}
		return showUsdFeePrefix
	})()
	const totalDisplayValue =
		streamingTotal !== undefined
			? streamingTotal
			: eventsTotalDisplayValue !== undefined
				? eventsTotalDisplayValue + fee
				: previousTotal !== undefined
					? previousTotal
					: total
	const totalDisplay = showUsdTotalPrefix
		? PriceFormatter.format(totalDisplayValue)
		: PriceFormatter.formatAmountShort(String(totalDisplayValue))

	return {
		events,
		fee,
		feeBreakdown,
		feeDisplay,
		...(!hasNonAdditiveVaultActivity(events) || params.voucher
			? { total, totalDisplay }
			: {}),
	}
}

export function enrichReceiptEventAmounts(
	events: KnownEvent[],
	getTokenMetadata: (token: Address.Address) =>
		| {
				currency: string
				decimals: number
				symbol: string
		  }
		| undefined,
): KnownEvent[] {
	return events.map((event) => ({
		...event,
		parts: event.parts.map((part) => {
			if (part.type !== 'amount') return part
			return { ...part, value: enrichAmount(part.value, getTokenMetadata) }
		}),
		...(event.totalAmount
			? {
					totalAmount: enrichAmount(event.totalAmount, getTokenMetadata),
				}
			: {}),
	}))
}

function enrichAmount(
	amount: NonNullable<KnownEvent['totalAmount']>,
	getTokenMetadata: Parameters<typeof enrichReceiptEventAmounts>[1],
): NonNullable<KnownEvent['totalAmount']> {
	const metadata = getTokenMetadata(amount.token)
	if (!metadata) return amount
	return {
		...amount,
		currency: amount.currency ?? metadata.currency,
		decimals: amount.decimals ?? metadata.decimals,
		symbol: amount.symbol ?? metadata.symbol,
	}
}

export function getReceiptEventSideAmount(
	event: KnownEvent,
): NonNullable<KnownEvent['totalAmount']> | undefined {
	if (
		event.parts.some(
			(part) => part.type === 'action' && PRIVATE_ZONE_ACTIONS.has(part.value),
		)
	)
		return undefined
	if (event.totalAmount) return event.totalAmount
	const amounts = event.parts.flatMap((part) =>
		part.type === 'amount' ? [part.value] : [],
	)
	if (event.type === 'swap') return amounts[0]
	return amounts.length === 1 ? amounts[0] : undefined
}

export function isReceiptEventVisible(event: KnownEvent): boolean {
	return (
		event.type !== 'active key count changed' && !isNonceIncrementedEvent(event)
	)
}

function getReceiptDisplayEvents(
	knownEvents: KnownEvent[],
	voucher: ReceiptVoucher | null,
	feeToken: Address.Address | undefined,
): KnownEvent[] {
	const hasBlockedTransfer = knownEvents.some(
		(event) => event.type === 'transfer blocked',
	)
	return (
		voucher
			? [buildStreamedPaymentEvent(voucher, feeToken), ...knownEvents]
			: knownEvents
	).filter(
		(event) =>
			isReceiptEventVisible(event) &&
			(!hasBlockedTransfer ||
				event.type !== 'send' ||
				!event.meta?.to ||
				!Address.isEqual(event.meta.to, RECEIVE_POLICY_GUARD)),
	)
}

function buildStreamedPaymentEvent(
	voucher: ReceiptVoucher,
	feeToken: Address.Address | undefined,
): KnownEvent {
	const totalMicros = BigInt(
		Math.round(voucher.packetSize * voucher.packetCount * 1_000_000),
	)
	return {
		type: 'streamed payment',
		parts: [
			{ type: 'action', value: 'Streamed Payment' },
			...(feeToken
				? [
						{
							type: 'amount' as const,
							value: {
								value: totalMicros,
								decimals: 6,
								currency: 'USD',
								token: feeToken,
								symbol: 'pathUSD',
							},
						},
					]
				: []),
		],
		note: [
			[
				'Packets',
				{
					type: 'number',
					value: [BigInt(voucher.packetCount), 0] as [bigint, number],
				},
			],
			['Per packet', { type: 'text', value: `$${voucher.packetSize}` }],
			['Settlement', { type: 'text', value: 'final voucher proven on-chain' }],
		],
	}
}

function getKnownEventAmounts(
	events: readonly KnownEvent[],
): NonNullable<KnownEvent['totalAmount']>[] {
	return events.flatMap((event) => {
		if (event.type === 'approval') return []
		if (event.totalAmount) return [event.totalAmount]
		return event.parts.flatMap((part) =>
			part.type === 'amount' ? [part.value] : [],
		)
	})
}
