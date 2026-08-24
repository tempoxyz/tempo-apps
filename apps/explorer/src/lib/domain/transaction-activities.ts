import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { KnownEvent, KnownEventPart } from './known-events'

export type TransactionActivity = {
	id: string
	title: string
	type: string
	data: Record<string, ActivityDataValue>
}

export type ActivityDataValue =
	| string
	| number
	| boolean
	| null
	| ActivityDataValue[]
	| { [key: string]: ActivityDataValue }

const HIDDEN_FIELDS = new Set(['signer', 'status'])
const PRIVATE_ZONE_ACTIONS: Record<string, string> = {
	'private-assets-deposited': 'Private Zone Deposit',
	'private-assets-redeemed': 'Private Zone Withdrawal',
}

export function activitiesToKnownEvents(
	activities: readonly TransactionActivity[],
): KnownEvent[] {
	return activities.map((activity) => {
		const privateZoneAction = PRIVATE_ZONE_ACTIONS[activity.type]
		if (privateZoneAction)
			return {
				type: activity.type,
				parts: [{ type: 'action', value: privateZoneAction }],
			}

		const parts = activityParts(activity)
		const representedFields = new Set([
			'sourceAmount',
			'sourceToken',
			'destinationAmount',
			'destinationToken',
			'recipient',
			'sender',
			'spender',
		])
		return {
			type: activity.type,
			parts,
			...(activity.type === 'transfer'
				? {
						meta: {
							from: activityAddress(activity.data.sender),
							to: activityAddress(activity.data.recipient),
						},
					}
				: {}),
			note: Object.entries(activity.data).flatMap(([key, value]) => {
				if (HIDDEN_FIELDS.has(key) || value == null) return []
				if (representedFields.has(key)) return []
				const part = activityValueToPart(value)
				return part
					? [[formatLabel(key), part] as [string, KnownEventPart]]
					: []
			}),
		}
	})
}

function activityAddress(
	value: ActivityDataValue | undefined,
): Address.Address | undefined {
	return typeof value === 'string' && Address.validate(value)
		? value
		: undefined
}

function activityParts(activity: TransactionActivity): KnownEventPart[] {
	const parts: KnownEventPart[] = [{ type: 'action', value: activity.title }]
	const source = amountPart(activity.data, 'sourceAmount', 'sourceToken')
	const destination = amountPart(
		activity.data,
		'destinationAmount',
		'destinationToken',
	)
	if (source) parts.push(source)

	if (activity.type === 'swap' && destination) {
		parts.push({ type: 'text', value: 'for' }, destination)
	} else if (activity.type === 'approval') {
		pushAccount(parts, 'for spender', activity.data.spender)
	} else if (activity.type === 'mint') {
		pushAccount(parts, 'to', activity.data.recipient)
	} else if (activity.type === 'burn') {
		pushAccount(parts, 'from', activity.data.sender)
	} else if (activity.type === 'transfer') {
		const direction = activity.data.direction
		pushAccount(
			parts,
			direction === 'in' ? 'from' : 'to',
			direction === 'in' ? activity.data.sender : activity.data.recipient,
		)
	}
	return parts
}

function amountPart(
	data: TransactionActivity['data'],
	amountKey: string,
	tokenKey: string,
): KnownEventPart | null {
	const amount = asRecord(data[amountKey])
	const token = asRecord(data[tokenKey])
	if (!amount || !token) return null
	const baseUnits = amount.baseUnits
	const decimals = amount.decimals
	const address = token.address
	if (
		typeof baseUnits !== 'string' ||
		!/^\d+$/.test(baseUnits) ||
		typeof decimals !== 'number' ||
		typeof address !== 'string' ||
		!Address.validate(address)
	)
		return null
	return {
		type: 'amount',
		value: {
			value: BigInt(baseUnits),
			decimals,
			token: address,
			...(typeof token.symbol === 'string' ? { symbol: token.symbol } : {}),
			...(typeof amount.currency === 'string'
				? { currency: amount.currency }
				: {}),
		},
	}
}

function pushAccount(
	parts: KnownEventPart[],
	label: string,
	value: ActivityDataValue | undefined,
): void {
	if (typeof value !== 'string' || !Address.validate(value)) return
	parts.push({ type: 'text', value: label }, { type: 'account', value })
}

function asRecord(
	value: ActivityDataValue | undefined,
): Record<string, ActivityDataValue> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? value
		: null
}

function activityValueToPart(value: ActivityDataValue): KnownEventPart | null {
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
