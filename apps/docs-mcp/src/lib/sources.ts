/**
 * Registry of external doc sources to ingest into AI Search built-in storage.
 *
 * Each source must expose a Vocs-style or vitepress-plugin-llms style
 * `/llms.txt` index that lists per-page URLs. We fetch the index, ETag-check
 * it, then download each page as raw Markdown (appending `.md` to the path,
 * which both Vocs and vitepress-plugin-llms support).
 *
 * Note: `docs.tempo.xyz` is intentionally NOT in this list. It is configured
 * as the AI Search instance's external website data source and is auto-synced
 * by the managed crawler.
 */
export type SourceId = 'viem' | 'wagmi' | 'vocs'

export type Source = {
	id: SourceId
	base: string
	/** Human-readable description, written to metadata for clients. */
	description: string
}

export const SOURCES: Record<SourceId, Source> = {
	viem: {
		id: 'viem',
		base: 'https://viem.sh',
		description: 'TypeScript interface for Ethereum / Tempo',
	},
	wagmi: {
		id: 'wagmi',
		base: 'https://wagmi.sh',
		description: 'React Hooks for Ethereum / Tempo',
	},
	vocs: {
		id: 'vocs',
		base: 'https://vocs.sh',
		description: 'Documentation framework',
	},
}

export function parseSourceList(csv: string): Source[] {
	return csv
		.split(',')
		.map((s) => s.trim())
		.filter((s): s is SourceId => s in SOURCES)
		.map((id) => SOURCES[id])
}
