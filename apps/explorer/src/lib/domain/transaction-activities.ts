import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { KnownEvent, KnownEventPart } from './known-events'

export type TransactionActivity = {
	id: string
	title: string
	type: string
	data: Record<string, string | number | boolean>
}

const HIDDEN_FIELDS = new Set(['signer', 'status'])

export function activitiesToKnownEvents(
	activities: readonly TransactionActivity[],
): KnownEvent[] {
	return activities.map((activity) => ({
		type: activity.type,
		parts: [{ type: 'action', value: activity.title }],
		note: Object.entries(activity.data).flatMap(([key, value]) => {
			if (HIDDEN_FIELDS.has(key) || value == null) return []
			const part = activityValueToPart(value)
			return part ? [[formatLabel(key), part] as [string, KnownEventPart]] : []
		}),
	}))
}

function activityValueToPart(value: unknown): KnownEventPart | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return { type: 'number', value }
	}
	if (typeof value !== 'string') return null
	if (Address.validate(value)) return { type: 'account', value }
	if (Hex.validate(value)) return { type: 'hex', value }
	if (/^\d+$/.test(value)) return { type: 'number', value: BigInt(value) }
	return { type: 'text', value }
}

function formatLabel(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/^./, (character) => character.toUpperCase())
}
