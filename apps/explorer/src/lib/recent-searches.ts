import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import type { SearchResult } from '#routes/api/search'

const recentSearchesStorageKey = 'tempo-explorer-recent-searches'
export const recentSearchesLimit = 6

export function getSearchResultKey(result: SearchResult): string {
	if (result.type === 'block') return `block-${result.blockNumber}`
	if (result.type === 'transaction') return `tx-${result.hash.toLowerCase()}`
	return `${result.type}-${result.address.toLowerCase()}`
}

function isPersistedSearchResult(value: unknown): value is SearchResult {
	if (typeof value !== 'object' || value == null) return false

	const result = value as Record<string, unknown>
	if (
		result.type === 'block' &&
		typeof result.blockNumber === 'number' &&
		Number.isSafeInteger(result.blockNumber) &&
		result.blockNumber >= 0
	)
		return true

	if (
		result.type === 'transaction' &&
		typeof result.hash === 'string' &&
		Hex.validate(result.hash) &&
		Hex.size(result.hash) === 32 &&
		(result.timestamp === undefined || typeof result.timestamp === 'number')
	)
		return true

	const validCategory =
		result.category === undefined ||
		result.category === 'token' ||
		result.category === 'system' ||
		result.category === 'utility' ||
		result.category === 'account' ||
		result.category === 'precompile'
	const validAddressMetadata =
		(result.label === undefined || typeof result.label === 'string') &&
		(result.description === undefined ||
			typeof result.description === 'string') &&
		validCategory

	if (
		result.type === 'address' &&
		typeof result.address === 'string' &&
		Address.validate(result.address) &&
		typeof result.isTip20 === 'boolean' &&
		validAddressMetadata
	)
		return true

	if (
		result.type === 'token' &&
		typeof result.address === 'string' &&
		Address.validate(result.address) &&
		typeof result.name === 'string' &&
		typeof result.symbol === 'string' &&
		typeof result.isTip20 === 'boolean'
	)
		return true

	return false
}

export function loadRecentSearches(): SearchResult[] {
	if (typeof window === 'undefined') return []

	try {
		const rawValue = window.localStorage.getItem(recentSearchesStorageKey)
		if (!rawValue) return []
		const parsedValue = JSON.parse(rawValue)
		if (!Array.isArray(parsedValue)) return []
		return parsedValue
			.filter(isPersistedSearchResult)
			.slice(0, recentSearchesLimit)
	} catch {
		return []
	}
}

export function persistRecentSearches(results: SearchResult[]): void {
	if (typeof window === 'undefined') return

	try {
		if (results.length === 0) {
			window.localStorage.removeItem(recentSearchesStorageKey)
			return
		}

		window.localStorage.setItem(
			recentSearchesStorageKey,
			JSON.stringify(results.slice(0, recentSearchesLimit)),
		)
	} catch {}
}

export function removeRecentSearch(
	results: SearchResult[],
	target: SearchResult,
): SearchResult[] {
	const key = getSearchResultKey(target)
	return results.filter((item) => getSearchResultKey(item) !== key)
}

export function recentSearchLabel(result: SearchResult): string {
	if (result.type === 'block') return `block #${result.blockNumber}`
	if (result.type === 'transaction') return `transaction ${result.hash}`
	if (result.type === 'token')
		return `token ${result.name} (${result.symbol}), ${result.address}`
	return `address ${result.address}`
}
