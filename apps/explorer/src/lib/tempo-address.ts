import * as Address from 'ox/Address'
import { TempoAddress, VirtualAddress } from 'ox/tempo'

export type VirtualAddressParts = {
	masterId: string
	userTag: string
}

export function getVirtualAddressParts(
	address: string,
): VirtualAddressParts | undefined {
	if (!VirtualAddress.validate(address)) return undefined
	return VirtualAddress.parse(address)
}

export function normalizeSearchInput(input: string): string {
	const query = input.trim()
	if (!query) return ''
	if (TempoAddress.validate(query)) return TempoAddress.parse(query).address
	if (Address.validate(query, { strict: false })) return Address.checksum(query)
	return query
}
