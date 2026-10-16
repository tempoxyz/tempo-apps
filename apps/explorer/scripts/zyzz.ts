import type { Plugin } from 'vite'
import { zyzz } from 'zyzz/vite'

/**
 * The zyzz compiler for the explorer, shared by Vite and both Vitest configs.
 * The excluded modules hold no styles. Leaving them out of the source graph
 * speeds up builds and keeps the compiler from resolving their server- and
 * test-only imports. zyzz always excludes the Vite and Vitest configs.
 */
export function explorerZyzz(options: explorerZyzz.Options = {}): Plugin[] {
	return [
		zyzz({
			exclude: [
				'scripts/**',
				'test/**',
				// Entry, server, worker, and library modules. Resolving the client
				// entry's `react-dom/client` in SSR made Vite re-bundle React mid-session.
				'src/index.client.tsx',
				'src/index.server.ts',
				'src/lib/**',
				'src/routes/api/**',
				'src/workers/**',
				// Import `@tanstack/react-start/server` or `cloudflare:workers`, which
				// do not resolve for the browser. The receipt route's styles live in
				// its sibling `-$hash.styles.ts`.
				'src/routes/_layout/receipt/$hash.tsx',
				'src/wagmi.config.ts',
			],
			reset: options.reset,
			script: false,
		}),
	]
}

export declare namespace explorerZyzz {
	type Options = {
		/** Include zyzz's base reset. */
		reset?: boolean | undefined
	}
}
