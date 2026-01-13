import type * as IDX from 'idxs'

let cachedQB: ReturnType<typeof IDX.QueryBuilder.from> | null = null

export async function getQueryBuilder() {
	if (cachedQB) return cachedQB
	const IDX = await import('idxs')
	const IS = IDX.IndexSupply.create({
		apiKey: process.env.INDEXER_API_KEY,
	})
	cachedQB = IDX.QueryBuilder.from(IS)
	return cachedQB
}
