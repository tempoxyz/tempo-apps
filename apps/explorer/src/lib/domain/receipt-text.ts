import * as Value from 'ox/Value'
import { maxUint256, type TransactionReceipt } from 'viem'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events'
import type { ReceiptPresentation } from '#lib/domain/receipt-presentation'
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

export function renderReceiptText(
	data: ReceiptTextData,
	presentation: ReceiptPresentation,
): string {
	const { block, receipt } = data
	const { events, feeBreakdown, feeDisplay, totalDisplay } = presentation
	const formattedTime = DateFormatter.formatTimestampTime(block.timestamp)
	const lines: string[] = [center('TEMPO RECEIPT'), '']

	lines.push(`Block: ${receipt.blockNumber.toString()}`)
	lines.push(`Sender: ${receipt.from}`)
	lines.push(`Hash: ${receipt.transactionHash}`)
	lines.push(`Date: ${DateFormatter.formatTimestampDate(block.timestamp)}`)
	lines.push(
		`Time: ${formattedTime.time} ${formattedTime.timezone}${formattedTime.offset}`,
	)
	if (receipt.status === 'reverted') lines.push('Status: Failed')

	if (events.length > 0) {
		lines.push('', '-'.repeat(width), '')
		for (const [index, event] of events.entries()) {
			lines.push(`${index + 1}. ${formatEvent(event)}`)
			if (typeof event.note === 'string') {
				lines.push(`${indent}Memo: ${event.note}`)
			} else if (event.note) {
				for (const [label, part] of event.note) {
					const value = formatPart(part)
					lines.push(
						`${indent}${label}${part.type === 'text' && part.value === '' ? '' : ':'}${value ? ` ${value}` : ''}`,
					)
				}
			}
		}
	}

	if (feeBreakdown.length > 0) {
		lines.push('')
		for (const item of feeBreakdown) {
			const label = item.symbol ? `Fee (${item.symbol})` : 'Fee'
			lines.push(leftRight(label, item.display))
		}
	} else {
		lines.push('', leftRight('Fee', feeDisplay))
	}

	if (totalDisplay !== undefined) lines.push(leftRight('Total', totalDisplay))

	return lines.join('\n')
}

function formatEvent(event: KnownEvent): string {
	return event.parts.map(formatPart).filter(Boolean).join(' ')
}

function formatPart(part: KnownEventPart): string {
	switch (part.type) {
		case 'account':
			return HexFormatter.truncate(part.value)
		case 'action':
		case 'text':
			return part.value
		case 'amount': {
			const precisionLossTolerance = 10n ** 64n
			if (
				part.value.value >
				(maxUint256 / precisionLossTolerance) * precisionLossTolerance
			)
				return 'infinite'
			const value = PriceFormatter.formatAmount(
				Value.format(part.value.value, part.value.decimals ?? 18),
			)
			const suffix = part.value.symbol ?? part.value.currency
			return suffix ? `${value} ${suffix}` : value
		}
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

function center(text: string): string {
	const padding = Math.max(0, Math.floor((width - text.length) / 2))
	return ' '.repeat(padding) + text
}

function leftRight(left: string, right: string): string {
	const spacing = Math.max(1, width - left.length - right.length)
	return left + ' '.repeat(spacing) + right
}
