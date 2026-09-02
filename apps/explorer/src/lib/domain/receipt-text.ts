import * as Value from 'ox/Value'
import { maxUint256, type TransactionReceipt } from 'viem'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events'
import {
	getReceiptEventSideAmount,
	type ReceiptPresentation,
} from '#lib/domain/receipt-presentation'
import {
	DateFormatter,
	HexFormatter,
	PriceFormatter,
	RoleFormatter,
} from '#lib/formatting'

const width = 76
const indent = '  '

type ReceiptTextData = {
	block: { timestamp: bigint }
	receipt: Pick<
		TransactionReceipt,
		'blockNumber' | 'from' | 'status' | 'transactionHash'
	>
}

type ReceiptTextOptions = {
	summary?: string
}

export function renderReceiptText(
	data: ReceiptTextData,
	presentation: ReceiptPresentation,
	options: ReceiptTextOptions = {},
): string {
	const { block, receipt } = data
	const { events, feeBreakdown, feeDisplay, totalDisplay } = presentation
	const formattedTime = DateFormatter.formatTimestampTime(block.timestamp)
	const lines: string[] = [center('TEMPO RECEIPT'), '']

	lines.push(`TX HASH: ${receipt.transactionHash}`)
	lines.push(`DATE: ${DateFormatter.formatTimestampDate(block.timestamp)}`)
	lines.push(
		`TIME: ${formattedTime.time} ${formattedTime.timezone}${formattedTime.offset}`,
	)
	lines.push(`BLOCK: ${receipt.blockNumber.toString()}`)
	lines.push(`SENDER: ${receipt.from}`)
	if (options.summary) lines.push(`SUMMARY: ${options.summary.toUpperCase()}`)
	if (receipt.status === 'reverted') lines.push('STATUS: FAILED')

	if (events.length > 0) {
		lines.push('', '-'.repeat(width), '')
		for (const [index, event] of events.entries()) {
			const action = getEventAction(event)
			const sideAmount = getReceiptEventSideAmount(event)
			lines.push(
				leftRight(
					`${index + 1}. ${action.toUpperCase()}`,
					sideAmount ? formatAmount(sideAmount, true).toUpperCase() : '–',
				),
			)
			const details = event.parts
				.filter((part) => part.type !== 'action')
				.map(formatPart)
				.filter(Boolean)
				.join(' ')
			if (details) lines.push(`${indent}${details.toUpperCase()}`)
			if (typeof event.note === 'string') {
				lines.push(`${indent}MEMO: ${event.note.toUpperCase()}`)
			} else if (event.note) {
				for (const [label, part] of event.note) {
					const value = formatPart(part)
					lines.push(
						`${indent}${label.toUpperCase()}${part.type === 'text' && part.value === '' ? '' : ':'}${value ? ` ${value.toUpperCase()}` : ''}`,
					)
				}
			}
		}
	}

	if (feeBreakdown.length > 0) {
		lines.push('')
		for (const item of feeBreakdown) {
			const label = item.symbol ? `FEE (${item.symbol.toUpperCase()})` : 'FEE'
			lines.push(leftRight(label, item.display))
		}
	} else {
		lines.push('', leftRight('FEE', feeDisplay))
	}

	if (totalDisplay !== undefined) lines.push(leftRight('TOTAL', totalDisplay))

	return lines.join('\n')
}

function getEventAction(event: KnownEvent): string {
	const action = event.parts.find((part) => part.type === 'action')
	return action?.type === 'action' ? action.value : event.type
}

function formatPart(part: KnownEventPart): string {
	switch (part.type) {
		case 'account':
			return HexFormatter.truncate(part.value)
		case 'action':
		case 'text':
			return part.value
		case 'amount':
			return formatAmount(part.value, false)
		case 'contractCall':
			return `call ${HexFormatter.truncate(part.value.address)}`
		case 'duration':
			return DateFormatter.formatDuration(part.value)
		case 'hex':
			return HexFormatter.truncate(part.value)
		case 'number':
			return PriceFormatter.formatAmount(
				Array.isArray(part.value)
					? Value.format(part.value[0], part.value[1])
					: Value.format(BigInt(part.value)),
			)
		case 'role':
			return (
				RoleFormatter.getRoleName(part.value) ??
				HexFormatter.shortenHex(part.value)
			)
		case 'tick':
			return part.value.toLocaleString()
		case 'token':
			return part.value.symbol ?? HexFormatter.truncate(part.value.address)
	}
}

function formatAmount(
	amount: NonNullable<KnownEvent['totalAmount']>,
	short: boolean,
): string {
	const precisionLossTolerance = 10n ** 64n
	if (
		amount.value >
		(maxUint256 / precisionLossTolerance) * precisionLossTolerance
	)
		return 'infinite'
	const raw = Value.format(amount.value, amount.decimals ?? 18)
	const value = short
		? PriceFormatter.formatAmountShort(raw)
		: PriceFormatter.formatAmount(raw)
	const suffix = amount.symbol ?? amount.currency
	return suffix ? `${value} ${suffix}` : value
}

function center(text: string): string {
	const padding = Math.max(0, Math.floor((width - text.length) / 2))
	return ' '.repeat(padding) + text
}

function leftRight(left: string, right: string): string {
	const spacing = Math.max(1, width - left.length - right.length)
	return left + ' '.repeat(spacing) + right
}
