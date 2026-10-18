import { log, errorFields } from './log.js'
import { withTimeout } from './timeout.js'
import type { Source } from './sources.js'
import { workerMetrics } from './metrics.js'

export type SearchInstance = Pick<AiSearchInstance, 'search'>

/** Query independent indexes concurrently; keep the previous index as a migration fallback. */
export function searchInstance(
	namespace: Pick<AiSearchNamespace, 'get'>,
	fallbackId: string,
	sources: Source[],
	selected: string[],
): SearchInstance {
	const ids = [
		...new Set(
			sources
				.filter(
					(source) => selected.length === 0 || selected.includes(source.id),
				)
				.map((source) => source.instanceId ?? fallbackId),
		),
	]
	if (ids.length === 0) ids.push(fallbackId)
	return {
		async search(request) {
			const results = await Promise.allSettled(
				[...new Set([...ids, fallbackId])].map(async (instance) => {
					try {
						return await withTimeout(
							() => namespace.get(instance).search(request),
							4000,
						)
					} catch (error) {
						workerMetrics.count('tempo_docs_mcp_index_search_error_count', 1, {
							instance,
						})
						log.warn('search.index_failed', { instance, ...errorFields(error) })
						throw error
					}
				}),
			)
			const primary = results.slice(0, ids.length)
			const chunks = primary.flatMap((result) =>
				result.status === 'fulfilled' ? result.value.chunks : [],
			)
			// A populated destination is authoritative; do not merge frozen legacy copies.
			const fallback = results[ids.length]
			if (chunks.length === 0 && fallback?.status === 'fulfilled') {
				chunks.push(...fallback.value.chunks)
				workerMetrics.count('tempo_docs_mcp_index_fallback_count', 1, {})
			}
			if (
				chunks.length === 0 &&
				results.every((result) => result.status === 'rejected')
			)
				throw new Error('All selected search indexes unavailable')
			const unique = new Map<string, (typeof chunks)[number]>()
			for (const chunk of chunks) {
				const key = `${chunk.item?.key ?? ''}:${chunk.text}`
				if (!unique.has(key) || (unique.get(key)?.score ?? 0) < chunk.score)
					unique.set(key, chunk)
			}
			return {
				search_query: request.query ?? '',
				chunks: [...unique.values()]
					.sort((a, b) => b.score - a.score)
					.slice(0, request.ai_search_options?.retrieval?.max_num_results ?? 5),
			}
		},
	}
}
