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
const GENERIC_ACTIVITY_TYPES = new Set(['approval', 'burn', 'mint', 'transfer'])
const ZONE_EVENT_TYPES = new Set([
	'zone deposit',
	'zone encrypted deposit',
	'zone withdrawal',
	'zone bounce back',
])
const PRIVATE_ZONE_ACTIONS: Record<string, [string, string, string]> = {
	'private-assets-deposited': ['Private Zone Deposit', 'shares', 'shareToken'],
	'private-shares-redeemed': [
		'Private Zone Withdrawal',
		'outputAmount',
		'outputToken',
	],
}

export function activitiesToKnownEvents(
	activities: readonly TransactionActivity[],
	options: { portal?: Address.Address | null } = {},
): KnownEvent[] {
	return activities.flatMap((activity) => {
		if (
			activity.title.trim().toLowerCase() === 'unknown' ||
			activity.type.trim().toLowerCase() === 'unknown'
		)
			return []

		const privateZone = PRIVATE_ZONE_ACTIONS[activity.type]
		if (privateZone) {
			const [action, amountKey, tokenKey] = privateZone
			const amount = amountPart(activity.data, amountKey, tokenKey)
			const portal = activityAddress(options.portal ?? undefined)
			const zoneEvent: KnownEvent = {
				type: activity.type,
				parts: [
					{ type: 'action', value: action },
					...(amount ? [amount] : []),
					...(portal && activity.type === 'private-assets-deposited'
						? [
								{ type: 'text' as const, value: 'to' },
								{ type: 'account' as const, value: portal },
							]
						: []),
				],
			}
			const vaultEvent = vaultActivityEvent(activity)
			return vaultEvent ? [vaultEvent, zoneEvent] : [zoneEvent]
		}

		const vaultEvent = vaultActivityEvent(activity)
		if (vaultEvent) return [vaultEvent]

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
		return [
			{
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
			},
		]
	})
}

function vaultActivityEvent(activity: TransactionActivity): KnownEvent | null {
	const isDeposit = ['assets-deposited', 'private-assets-deposited'].includes(
		activity.type,
	)
	const isWithdrawal = [
		'assets-withdrawn',
		'private-shares-redeemed',
		'shares-redeemed',
	].includes(activity.type)
	if (!isDeposit && !isWithdrawal) return null
	const [sourceAmount, sourceToken, destinationAmount, destinationToken] =
		isDeposit
			? ['assets', 'assetToken', 'shares', 'shareToken']
			: [
					activity.type === 'assets-withdrawn' ? 'sharesBurned' : 'shares',
					'shareToken',
					'assets',
					'assetToken',
				]
	const source = amountPart(activity.data, sourceAmount, sourceToken)
	const destination = amountPart(
		activity.data,
		destinationAmount,
		destinationToken,
	)
	if (!source || !destination) return null
	return {
		type: activity.type,
		parts: [
			{
				type: 'action',
				value: isDeposit ? 'Vault Deposit' : 'Vault Withdrawal',
			},
			source,
			{ type: 'text', value: 'for' },
			destination,
		],
	}
}

export function selectTransactionDescriptionEvents(params: {
	activityEvents: readonly KnownEvent[]
	fallbackEvents: readonly KnownEvent[]
	knownCall: KnownEvent | null
}): KnownEvent[] {
	const hasPrivateZoneFallback = params.fallbackEvents.some(
		(event) => event !== params.knownCall && isPrivateZoneEvent(event),
	)
	const fallbackEvents = hasPrivateZoneFallback
		? params.fallbackEvents.filter((event) => event !== params.knownCall)
		: params.fallbackEvents
	if (params.activityEvents.length === 0) return [...fallbackEvents]

	const hasDecodedZoneEvent = fallbackEvents.some((event) =>
		ZONE_EVENT_TYPES.has(event.type),
	)
	const activitiesAreGeneric = params.activityEvents.every(
		(event) =>
			GENERIC_ACTIVITY_TYPES.has(event.type) || isNonceIncrementedEvent(event),
	)
	if (hasDecodedZoneEvent && activitiesAreGeneric) {
		return fallbackEvents.filter(
			(event) => !GENERIC_ACTIVITY_TYPES.has(event.type),
		)
	}

	const hasMeaningfulActivity = params.activityEvents.some(
		(event) => !isNonceIncrementedEvent(event),
	)
	const activityEvents =
		params.knownCall || hasMeaningfulActivity
			? params.activityEvents.filter((event) => !isNonceIncrementedEvent(event))
			: params.activityEvents
	const hasPrivateZoneActivity = activityEvents.some(isPrivateZoneEvent)
	return params.knownCall && !hasPrivateZoneActivity
		? [params.knownCall, ...activityEvents]
		: [...activityEvents]
}

function isPrivateZoneEvent(event: KnownEvent): boolean {
	return (
		PRIVATE_ZONE_ACTIONS[event.type] !== undefined ||
		event.parts.some(
			(part) =>
				part.type === 'action' &&
				['Private Zone Deposit', 'Private Zone Withdrawal'].includes(
					part.value,
				),
		)
	)
}

export function isNonceIncrementedEvent(event: KnownEvent): boolean {
	return (
		event.type.trim().toLowerCase() === 'nonce incremented' ||
		event.parts.some(
			(part) =>
				part.type === 'action' &&
				part.value.trim().toLowerCase() === 'nonce incremented',
		)
	)
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
	const rawAmount = data[amountKey]
	const rawToken = data[tokenKey]
	if (
		typeof rawAmount === 'string' &&
		/^\d+$/.test(rawAmount) &&
		typeof rawToken === 'string' &&
		Address.validate(rawToken)
	)
		return {
			type: 'amount',
			value: { value: BigInt(rawAmount), token: rawToken },
		}

	const amount = asRecord(rawAmount)
	const token = asRecord(rawToken)
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
