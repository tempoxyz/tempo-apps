/**
 * Registry of external doc sites to ingest into AI Search built-in storage.
 *
 * Each source must expose either:
 *   - a Vocs auto-generated `/llms.txt` (viem, vocs, tempo)
 *   - a `vitepress-plugin-llms`-generated `/llms.txt` (wagmi)
 *
 * Pages are then fetched as raw Markdown via `<page>.md`, which both Vocs and
 * vitepress-plugin-llms serve out of the box.
 *
 * `docs.tempo.xyz` is intentionally NOT here — it's the AI Search instance's
 * external website data source and is auto-crawled.
 */
export type Source = { id: string; base: string }

export const SOURCES: readonly Source[] = [
	{ id: 'viem', base: 'https://viem.sh' },
	{ id: 'wagmi', base: 'https://wagmi.sh' },
	{ id: 'vocs', base: 'https://vocs.sh' },
	{ id: 'mpp', base: 'https://mpp.dev' },
]
