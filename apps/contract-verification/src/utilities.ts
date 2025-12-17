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
