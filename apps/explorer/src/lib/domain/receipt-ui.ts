import type { Hex } from 'ox'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events'
import { getReceiptEventSideAmount } from '#lib/domain/receipt-presentation'

/** The full event description already carries its token quantities. */
export function getReceiptDistinctSideAmount(event: KnownEvent) {
	const amount = getReceiptEventSideAmount(event)
	if (!amount || amount.value <= 0n) return undefined
	const alreadyShown = event.parts.some(
		(part) =>
			part.type === 'amount' &&
			part.value.token.toLowerCase() === amount.token.toLowerCase() &&
			part.value.value === amount.value &&
			part.value.decimals === amount.decimals,
	)
	return alreadyShown ? undefined : amount
}

export type ReceiptNotePresentation =
	| { kind: 'block'; label: string; id: string }
	| { kind: 'transaction'; label: string; hash: Hex.Hex }
	| { kind: 'time'; label: string; timestamp: bigint; iso: string }
	| { kind: 'part'; label: string; part: KnownEventPart }

export function getReceiptNotePresentation(
	label: string,
	part: KnownEventPart,
): ReceiptNotePresentation {
	const key = label.toLowerCase().replace(/[\s_-]/g, '')
	if (key === 'block' || key === 'blocknumber') {
		const value =
			part.type === 'number'
				? Array.isArray(part.value)
					? part.value[1] === 0
						? part.value[0]
						: undefined
					: part.value
				: part.type === 'text'
					? part.value
					: undefined
		if (value !== undefined && /^\d+$/.test(String(value)))
			return { kind: 'block', label: 'Block', id: String(value) }
	}
	if (
		(key === 'transactionhash' || key === 'txhash') &&
		(part.type === 'hex' || part.type === 'text') &&
		/^0x[\da-f]{64}$/i.test(part.value)
	)
		return {
			kind: 'transaction',
			label: 'Transaction',
			hash: part.value as Hex.Hex,
		}
	if (key === 'timestamp' && part.type === 'text') {
		// Accept an explicit timezone only; do not guess the zone of an ambiguous date.
		if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(part.value)) {
			const ms = Date.parse(part.value)
			if (Number.isFinite(ms))
				return {
					kind: 'time',
					label: 'Local time',
					timestamp: BigInt(Math.floor(ms / 1_000)),
					iso: new Date(ms).toISOString(),
				}
		}
	}
	if (key === 'direction' && part.type === 'text') {
		const direction = part.value.toLowerCase()
		if (direction === 'out' || direction === 'in')
			return {
				kind: 'part',
				label: 'Transfer',
				part: {
					type: 'text',
					value: direction === 'out' ? 'Sent' : 'Received',
				},
			}
	}
	return { kind: 'part', label, part }
}

/** Keep event-specific details; the receipt header already supplies this context. */
export function getReceiptEventNote(
	note: KnownEvent['note'],
	context: { blockNumber: bigint; hash: Hex.Hex; timestamp: bigint },
): KnownEvent['note'] {
	if (!Array.isArray(note)) return note
	const details = note.map(([label, part]) =>
		getReceiptNotePresentation(label, part),
	)
	// A referenced transaction/block may have its own associated timestamp.
	if (
		details.some(
			(detail) =>
				(detail.kind === 'transaction' &&
					detail.hash.toLowerCase() !== context.hash.toLowerCase()) ||
				(detail.kind === 'block' && BigInt(detail.id) !== context.blockNumber),
		)
	)
		return note
	const filtered = note.filter((_, index) => {
		const detail = details[index]
		if (detail.kind === 'block')
			return BigInt(detail.id) !== context.blockNumber
		if (detail.kind === 'transaction')
			return detail.hash.toLowerCase() !== context.hash.toLowerCase()
		if (detail.kind === 'time')
			return Date.parse(detail.iso) !== Number(context.timestamp) * 1000
		return true
	})
	return filtered.length ? filtered : undefined
}
