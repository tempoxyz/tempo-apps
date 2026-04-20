import type { SortDirection } from '#lib/server/tempo-queries'

/**
 * Data sources to query for transaction history:
 * - txs: Direct transactions (from/to the address)
 * - transfers: Transfer events where address is sender/recipient
 * - emitted: Transfer events emitted by the address (for token contracts)
 */
export type Sources = {
	txs: boolean
	transfers: boolean
	emitted: boolean
}

export function parseSources(val: string | undefined): Sources {
	if (val === undefined) {
		return { txs: true, transfers: true, emitted: false }
	}

	const parts = val
		.split(',')
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean)

	return {
		txs: parts.includes('txs'),
		transfers: parts.includes('transfers'),
		emitted: parts.includes('emitted'),
	}
}

export function canUseTempoActivityApi(params: {
	hasTempoApiKey: boolean
	isTip20: boolean
	sources: Sources
	sortDirection: SortDirection
}): boolean {
	return (
		params.hasTempoApiKey &&
		!params.isTip20 &&
		params.sortDirection === 'desc' &&
		params.sources.txs &&
		params.sources.transfers &&
		!params.sources.emitted
	)
}
