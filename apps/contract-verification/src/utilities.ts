import { env } from 'cloudflare:workers'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/**
 * Normalize absolute source paths to relative paths.
 * Extracts the portion after common patterns like /src/, /contracts/, /lib/
 * Falls back to filename if no pattern matches.
 */
export function normalizeSourcePath(absolutePath: string) {
	if (!absolutePath.startsWith('/')) return absolutePath

	// Common source directory patterns
	const patterns = ['/src/', '/contracts/', '/lib/', '/test/', '/script/']

	for (const pattern of patterns) {
		const index = absolutePath.lastIndexOf(pattern)
		if (index !== -1) return absolutePath.slice(index + 1) // +1 to remove leading slash
	}

	// Fallback: just use the filename
	const parts = absolutePath.split('/')
	return parts[parts.length - 1] ?? absolutePath
}

export function sourcifyError(
	context: Context,
	status: ContentfulStatusCode,
	customCode: string,
	message: string,
) {
	return context.json(
		{
			message,
			customCode,
			errorId: globalThis.crypto.randomUUID(),
		},
		status,
	)
}

/**
 * Checks if an origin matches an allowed hostname pattern.
 * pathname and search parameters are ignored
 */
export function originMatches(params: { origin: string; pattern: string }) {
	if (env.NODE_ENV === 'development') return true

	const { pattern } = params

	if (!params.origin) return false
	let origin: string

	try {
		const stripExtra = new URL(params.origin)
		origin = `${stripExtra.protocol}//${stripExtra.hostname}`
	} catch {
		return false
	}

	if (origin === pattern) return true
	if (!pattern.includes('*')) return false

	return new RegExp(
		`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
	).test(origin)
}
