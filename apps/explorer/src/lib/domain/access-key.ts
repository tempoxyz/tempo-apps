import type { Address } from 'viem'
import type { Transaction } from 'viem/tempo'
import type { KnownEvent } from './known-events'

export type KeyAuthorization = NonNullable<
	Transaction.TransactionTempo['keyAuthorization']
>

/** Keep transaction authorization visible even when indexed activities replace logs. */
export function withKeyAuthorizationDescription(
	events: KnownEvent[],
	account: Address,
	authorization: KeyAuthorization | null | undefined,
) {
	if (!authorization) return { events, authorizationEvent: undefined }
	const authorizationEvent: KnownEvent = {
		type: 'key authorized',
		parts: [
			{ type: 'action', value: 'Authorize Key' },
			{ type: 'account', value: authorization.address },
			{ type: 'text', value: 'for' },
			{ type: 'account', value: account },
		],
	}
	return {
		authorizationEvent,
		events: [
			authorizationEvent,
			...events.filter((event) => {
				if (event.type !== 'key authorized') return true
				const accounts = event.parts.filter((part) => part.type === 'account')
				return (
					accounts[0]?.value.toLowerCase() !==
						authorization.address.toLowerCase() ||
					accounts[1]?.value.toLowerCase() !== account.toLowerCase()
				)
			}),
		],
	}
}

export function groupKeyScopes(scopes: KeyAuthorization['scopes']) {
	if (scopes === undefined) return undefined
	const targets = new Map<
		string,
		{
			address: `0x${string}`
			rules: NonNullable<KeyAuthorization['scopes']>[number][]
		}
	>()
	for (const scope of scopes) {
		const key = scope.address.toLowerCase()
		const target = targets.get(key) ?? { address: scope.address, rules: [] }
		target.rules.push(scope)
		targets.set(key, target)
	}
	return [...targets.values()]
}

export function formatKeyPeriod(period: number | undefined) {
	if (!period) return 'One-time allowance'
	for (const [seconds, unit] of [
		[86_400, 'day'],
		[3_600, 'hour'],
		[60, 'minute'],
		[1, 'second'],
	] as const) {
		if (period % seconds !== 0) continue
		const count = period / seconds
		return `Every ${count.toLocaleString('en-US')} ${unit}${count === 1 ? '' : 's'}`
	}
	return `Every ${period} seconds`
}

export function formatKeyExpiry(expiry: number | null | undefined) {
	if (expiry == null) return 'Never expires'
	const date = new Date(expiry * 1_000)
	if (Number.isNaN(date.getTime())) return `Unix timestamp ${expiry}`
	return `${date.toLocaleString('en-US', {
		timeZone: 'UTC',
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	})} UTC`
}
