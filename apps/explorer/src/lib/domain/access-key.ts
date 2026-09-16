import { encodeEventTopics, type Address, type Log } from 'viem'
import { Addresses, type Transaction } from 'viem/tempo'
import { Abis } from '#lib/abis'

export type KeyAuthorization = NonNullable<
	Transaction.TransactionTempo['keyAuthorization']
>

/** Attach envelope permissions only to the corresponding keychain event. */
export function isKeyAuthorizationEvent(
	log: Pick<Log, 'address' | 'topics'>,
	account: Address,
	publicKey: Address,
) {
	if (log.address.toLowerCase() !== Addresses.accountKeychain.toLowerCase())
		return false
	const topics = encodeEventTopics({
		abi: Abis.accountKeychain,
		eventName: 'KeyAuthorized',
		args: { account, publicKey },
	})
	return topics.every(
		(topic, index) => topic === log.topics[index]?.toLowerCase(),
	)
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
