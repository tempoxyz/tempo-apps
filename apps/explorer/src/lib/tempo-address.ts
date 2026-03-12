import type { Address as AddressType } from 'ox'
import * as Address from 'ox/Address'

const TEMPO_ZONE_ADDRESS_PATTERN =
	/^tempoz([0-9a-fA-F]+)x(0x[a-fA-F0-9]{40})(?:\s*\([^)]*\))?$/i
const TEMPO_MAINNET_ADDRESS_PATTERN =
	/^tempox(0x[a-fA-F0-9]{40})(?:\s*\([^)]*\))?$/i
const TEMPO_ZONE_ADDRESS_PREFIX_PATTERN =
	/^tempoz[0-9a-fA-F]+x(0x[a-fA-F0-9]+)(?:\s*\([^)]*\))?$/i
const TEMPO_MAINNET_ADDRESS_PREFIX_PATTERN =
	/^tempox(0x[a-fA-F0-9]+)(?:\s*\([^)]*\))?$/i
const RAW_ADDRESS_WITH_OPTIONAL_ZONE_PATTERN =
	/^(0x[a-fA-F0-9]+)(?:\s*\([^)]*\))?$/

export type ParsedTempoAddress = {
	address: AddressType.Address
	zoneId: number | null
}

function toAddress(value: string): AddressType.Address | null {
	if (!Address.validate(value)) return null
	return value as AddressType.Address
}

function extractAddressPart(input: string): string | null {
	const query = input.trim()

	const zoneMatch = query.match(TEMPO_ZONE_ADDRESS_PREFIX_PATTERN)
	if (zoneMatch) return zoneMatch[1]

	const mainnetMatch = query.match(TEMPO_MAINNET_ADDRESS_PREFIX_PATTERN)
	if (mainnetMatch) return mainnetMatch[1]

	const rawMatch = query.match(RAW_ADDRESS_WITH_OPTIONAL_ZONE_PATTERN)
	if (rawMatch) return rawMatch[1]

	return null
}

export function normalizeSearchInput(input: string): string {
	const query = input.trim()
	if (!query) return ''

	return extractAddressPart(query) ?? query
}

export function parseTempoAddress(input: string): ParsedTempoAddress | null {
	const query = input.trim()

	const zoneMatch = query.match(TEMPO_ZONE_ADDRESS_PATTERN)
	if (zoneMatch) {
		const address = toAddress(zoneMatch[2])
		if (!address) return null
		return {
			address,
			zoneId: Number.parseInt(zoneMatch[1], 16),
		}
	}

	const mainnetMatch = query.match(TEMPO_MAINNET_ADDRESS_PATTERN)
	if (mainnetMatch) {
		const address = toAddress(mainnetMatch[1])
		if (!address) return null
		return {
			address,
			zoneId: null,
		}
	}

	const rawAddress = extractAddressPart(query)
	if (!rawAddress) return null

	const address = toAddress(rawAddress)
	if (!address) return null

	return {
		address,
		zoneId: null,
	}
}
