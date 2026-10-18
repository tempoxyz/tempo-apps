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
				ids.map(async (instance) => {
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
			const chunks = results.flatMap((result) =>
				result.status === 'fulfilled' ? result.value.chunks : [],
			)
			// Include the previous index during migration: a nonempty new index may
			// still be only partially populated.
			if (!ids.includes(fallbackId)) {
				try {
					const fallback = await withTimeout(
						() => namespace.get(fallbackId).search(request),
						4000,
					)
					chunks.push(...fallback.chunks)
					workerMetrics.count('tempo_docs_mcp_index_fallback_count', 1, {})
				} catch (error) {
					log.warn('search.previous_index_failed', errorFields(error))
				}
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
				chunks: [...unique.values()].sort((a, b) => b.score - a.score),
			}
		},
	}
}
