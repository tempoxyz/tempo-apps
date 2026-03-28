import type { Address, Hex } from 'viem'

const VIRTUAL_MAGIC = 'fdfdfdfdfdfdfdfdfdfd'

export function isVirtualAddress(addr: Address): boolean {
	return addr.slice(10, 30).toLowerCase() === VIRTUAL_MAGIC
}

export function buildVirtualAddress(masterId: Hex, userTag: Hex): Address {
	const mid = masterId.slice(2)
	const tag = userTag.slice(2)
	if (mid.length !== 8)
		throw new Error('masterId must be bytes4 (0x + 8 hex chars)')
	if (tag.length !== 12)
		throw new Error('userTag must be bytes6 (0x + 12 hex chars)')
	return `0x${mid}${VIRTUAL_MAGIC}${tag}` as Address
}

export function decodeVirtualAddress(addr: Address): {
	masterId: Hex
	userTag: Hex
} | null {
	if (!isVirtualAddress(addr)) return null
	return {
		masterId: `0x${addr.slice(2, 10)}` as Hex,
		userTag: `0x${addr.slice(30, 42)}` as Hex,
	}
}

export function randomUserTag(): Hex {
	const bytes = new Uint8Array(6)
	crypto.getRandomValues(bytes)
	return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}` as Hex
}

export function formatAddress(addr: Address): string {
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
