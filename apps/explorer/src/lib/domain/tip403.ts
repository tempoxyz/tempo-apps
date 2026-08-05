import type * as Address from 'ox/Address'

export type Tip403PolicyType = 'whitelist' | 'blacklist' | 'compound'

export function parseTip403PolicyId(value: string): string | undefined {
	if (!/^\d+$/.test(value)) return undefined
	try {
		const id = BigInt(value)
		if (id < 0n || id > 2n ** 64n - 1n) return undefined
		return id.toString()
	} catch {
		return undefined
	}
}

export function parseTip403PolicyType(value: number): Tip403PolicyType {
	if (value === 0) return 'whitelist'
	if (value === 1) return 'blacklist'
	return 'compound'
}

export function updateTip403Member(
	members: Map<string, Address.Address>,
	account: Address.Address,
	active: boolean,
) {
	const key = account.toLowerCase()
	if (active) members.set(key, account)
	else members.delete(key)
}
