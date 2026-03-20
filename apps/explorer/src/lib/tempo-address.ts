import { TempoAddress } from 'viem/tempo'

export function normalizeSearchInput(input: string): string {
	const query = input.trim()
	if (!query) return ''
	if (TempoAddress.validate(query)) return TempoAddress.parse(query).address
	return query
}
