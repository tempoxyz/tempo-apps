import type { Address } from 'ox'

const zonePortalPrefix = '0x5ad000000000000000000000' as const

export function isZonePortalAddress(address: Address.Address): boolean {
	return address.toLowerCase().startsWith(zonePortalPrefix)
}

export function getZonePortalId(address: Address.Address): bigint | undefined {
	if (!isZonePortalAddress(address)) return
	return BigInt(`0x${address.slice(zonePortalPrefix.length)}`)
}
