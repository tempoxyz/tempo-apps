import * as Address from 'ox/Address'
import type { KnownEvent } from '#lib/domain/known-events'

export function getPerspectiveEvent(
	event: KnownEvent,
	accountAddress?: Address.Address,
) {
	if (!accountAddress) return event
	if (event.type !== 'send') return event
	const toMatches =
		event.meta?.to && Address.isEqual(event.meta.to, accountAddress)
	const fromMatches =
		event.meta?.from && Address.isEqual(event.meta.from, accountAddress)
	if (fromMatches && !toMatches) {
		const updatedParts = event.parts.map((part) =>
			part.type === 'action' && part.value === 'Send'
				? { ...part, value: 'Sent' }
				: part,
		)
		return { ...event, parts: updatedParts }
	}
	if (!toMatches || fromMatches) return event

	const sender = event.meta?.from
	const updatedParts = event.parts.map((part) => {
		if (part.type === 'action') return { ...part, value: 'Received' }
		if (part.type === 'text' && part.value.toLowerCase() === 'to')
			return { ...part, value: 'from' }
		if (part.type === 'account' && sender) return { ...part, value: sender }
		return part
	})
	return { ...event, parts: updatedParts }
}
