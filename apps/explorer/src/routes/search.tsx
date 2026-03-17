import { createFileRoute, redirect } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import * as z from 'zod/mini'
import { getApiUrl } from '#lib/env'
import { normalizeSearchInput } from '#lib/tempo-address'

type SearchMatch =
	| {
			type: 'block'
			blockNumber: number
	  }
	| {
			type: 'address'
			address: Address.Address
	  }
	| {
			type: 'token'
			address: Address.Address
	  }
	| {
			type: 'transaction'
			hash: Hex.Hex
	  }

function parseBlockInput(raw: string): string | null {
	const trimmed = raw.trim()
	const withoutHash = trimmed.startsWith('#')
		? trimmed.slice(1).trim()
		: trimmed
	if (!/^\d+$/.test(withoutHash)) return null
	const value = Number(withoutHash)
	if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0)
		return null
	return String(value)
}

function parseSearchMatch(result: unknown): SearchMatch | null {
	if (typeof result !== 'object' || result == null) return null

	const value = result as Record<string, unknown>

	if (
		value.type === 'block' &&
		typeof value.blockNumber === 'number' &&
		Number.isSafeInteger(value.blockNumber) &&
		value.blockNumber >= 0
	) {
		return {
			type: 'block',
			blockNumber: value.blockNumber,
		}
	}

	if (
		(value.type === 'address' || value.type === 'token') &&
		typeof value.address === 'string' &&
		Address.validate(value.address)
	) {
		return {
			type: value.type,
			address: value.address,
		}
	}

	if (
		value.type === 'transaction' &&
		typeof value.hash === 'string' &&
		Hex.validate(value.hash) &&
		Hex.size(value.hash) === 32
	) {
		return {
			type: 'transaction',
			hash: value.hash,
		}
	}

	return null
}

async function fetchUniqueSearchMatch(
	query: string,
): Promise<SearchMatch | null> {
	const response = await fetch(
		getApiUrl('/api/search', new URLSearchParams({ q: query })),
	)
	if (!response.ok) return null

	const json = (await response.json()) as { results?: unknown }
	if (!Array.isArray(json.results) || json.results.length !== 1) return null

	return parseSearchMatch(json.results[0])
}

function getRedirectForSearchMatch(result: SearchMatch) {
	if (result.type === 'block') {
		return {
			to: '/block/$id',
			params: { id: String(result.blockNumber) },
		} as const
	}

	if (result.type === 'transaction') {
		return {
			to: '/tx/$hash',
			params: { hash: result.hash },
		} as const
	}

	if (result.type === 'token') {
		return {
			to: '/token/$address',
			params: { address: result.address },
		} as const
	}

	return {
		to: '/address/$address',
		params: { address: result.address },
	} as const
}

function getLandingRedirect(query: string) {
	if (!query) return { to: '/' } as const

	return {
		to: '/',
		search: { q: query },
	} as const
}

export const Route = createFileRoute('/search')({
	validateSearch: z.object({
		q: z.optional(z.string()),
	}).parse,
	beforeLoad: async ({ search }) => {
		const rawQuery = search.q?.trim() ?? ''
		if (!rawQuery) throw redirect(getLandingRedirect(rawQuery))

		const normalizedQuery = normalizeSearchInput(rawQuery)
		const blockId = parseBlockInput(normalizedQuery)

		if (blockId != null)
			throw redirect({
				to: '/block/$id',
				params: { id: blockId },
			})

		if (Address.validate(normalizedQuery))
			throw redirect({
				to: '/address/$address',
				params: { address: normalizedQuery },
			})

		if (Hex.validate(normalizedQuery) && Hex.size(normalizedQuery) === 32)
			throw redirect({
				to: '/tx/$hash',
				params: { hash: normalizedQuery },
			})

		let uniqueMatch: SearchMatch | null = null
		try {
			uniqueMatch = await fetchUniqueSearchMatch(normalizedQuery)
		} catch {}

		if (uniqueMatch != null)
			throw redirect(getRedirectForSearchMatch(uniqueMatch))

		throw redirect(getLandingRedirect(rawQuery))
	},
	component: () => null,
})
