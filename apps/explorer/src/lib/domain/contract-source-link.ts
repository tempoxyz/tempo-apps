import type { ContractSourceFile } from './contract-source'

type SourceSelection = {
	id: string
	range: { start: number; end: number } | null
}

/** Query links take precedence; previously shared fragment links still work. */
export function parseContractSourceLink(
	url: URL,
	entries: Array<[string, ContractSourceFile]>,
): SourceSelection | null {
	const query = url.searchParams
	const params =
		query.has('source') || query.has('line')
			? query
			: new URLSearchParams(url.hash.slice(1))
	const path =
		params.get('source') ??
		entries.find(
			([name]) =>
				url.hash ===
				`#source-file-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
		)?.[0] ??
		(params.has('line') ? entries[0]?.[0] : undefined)
	const entry = entries.find(([name]) => name === path)
	if (!entry) return null
	if (!params.has('line')) return { id: entry[0], range: null }
	const count = entry[1].content.split('\n').length
	function clampLine(value: string | null, fallback: number) {
		const number = Number(value)
		return value?.trim() && Number.isFinite(number)
			? Math.min(count, Math.max(1, Math.floor(number)))
			: fallback
	}
	const start = clampLine(params.get('line'), 1)
	const end = clampLine(params.get('end'), start)
	return {
		id: entry[0],
		range: { start: Math.min(start, end), end: Math.max(start, end) },
	}
}

export function createContractSourceLink(
	url: URL,
	selection: SourceSelection,
): string {
	const result = new URL(url)
	result.searchParams.set('tab', 'contract')
	result.searchParams.set('source', selection.id)
	result.searchParams.delete('line')
	result.searchParams.delete('end')
	if (selection.range) {
		const start = Math.min(selection.range.start, selection.range.end)
		const end = Math.max(selection.range.start, selection.range.end)
		result.searchParams.set('line', String(start))
		if (end !== start) result.searchParams.set('end', String(end))
	}
	result.hash = ''
	return result.toString()
}
