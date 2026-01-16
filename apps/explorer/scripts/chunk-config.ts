/**
 * Vendor chunk configuration for Vite/Rolldown builds.
 * Separates vendor dependencies into cacheable chunks.
 *
 * IMPORTANT: Only applies to client builds to avoid bundling browser-specific
 * code (like `window` references) into the server bundle.
 */

// Key = chunk name suffix, value = exact packages or prefix to match
export const VENDOR_CHUNKS: Record<string, string[] | string> = {
	react: ['react', 'react-dom', 'scheduler'],
	tanstack: '@tanstack/', // prefix match
	web3: ['viem', 'wagmi', 'ox', 'abitype'],
}

/**
 * Extract the package name from a node_modules path.
 * Handles both regular packages (lodash) and scoped packages (@tanstack/react-query).
 */
export function extractPackageName(id: string): string | undefined {
	if (!id.includes('node_modules')) return undefined
	const parts = id.split('node_modules/').pop()?.split('/') ?? []
	return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

/**
 * Determine which vendor chunk a module belongs to based on its path.
 * Returns the chunk name (e.g., 'vendor-react') or undefined if not a vendor chunk.
 *
 * @param id - Module path
 * @param isClientBuild - Whether this is a client build (not SSR/server)
 */
export function getVendorChunk(
	id: string,
	isClientBuild: boolean = false,
): string | undefined {
	// Only apply manual chunks to client builds to avoid bundling
	// browser-specific code into the server bundle
	if (!isClientBuild) return undefined

	const pkg = extractPackageName(id)
	if (!pkg) return undefined

	for (const [chunk, match] of Object.entries(VENDOR_CHUNKS)) {
		const isMatch = Array.isArray(match)
			? match.includes(pkg)
			: pkg.startsWith(match)
		if (isMatch) return `vendor-${chunk}`
	}
	return undefined
}
