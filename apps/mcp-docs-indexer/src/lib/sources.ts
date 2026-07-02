export type Source = {
	id: string
	base: string
	indexPath?: string
	description?: string
}

type SourceConfig = {
	id?: unknown
	base?: unknown
	indexPath?: unknown
	description?: unknown
}

/**
 * Parse deploy-time source configuration from `wrangler.jsonc`.
 *
 * Adding a docs source should not require changing Worker code unless the new
 * site exposes a different index or Markdown URL format.
 */
export function parseSources(config: unknown): Source[] {
	const sources = typeof config === 'string' ? JSON.parse(config) : config
	if (!Array.isArray(sources)) throw new Error('SOURCES must be an array')
	return sources.map((source, index) => normalizeSource(source, index))
}

function normalizeSource(source: SourceConfig, index: number): Source {
	if (!source || typeof source !== 'object') {
		throw new Error(`SOURCES[${index}] must be an object`)
	}

	const id = expectString(source.id, `SOURCES[${index}].id`)
	const base = normalizeBase(
		expectString(source.base, `SOURCES[${index}].base`),
		index,
	)
	const indexPath =
		typeof source.indexPath === 'string' ? source.indexPath.trim() : '/llms.txt'
	const description =
		typeof source.description === 'string'
			? source.description.trim()
			: undefined

	return {
		id,
		base,
		indexPath: indexPath.startsWith('/') ? indexPath : `/${indexPath}`,
		...(description ? { description } : {}),
	}
}

function normalizeBase(value: string, index: number): string {
	let url: URL
	try {
		url = new URL(value)
	} catch {
		throw new Error(`SOURCES[${index}].base must be a valid URL`)
	}
	if (url.protocol !== 'https:') {
		throw new Error(`SOURCES[${index}].base must be an https URL`)
	}
	return url.origin
}

function expectString(value: unknown, name: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${name} must be a non-empty string`)
	}
	return value.trim()
}
