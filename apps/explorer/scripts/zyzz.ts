import type { Plugin } from 'vite'
import { zyzz } from 'zyzz/vite'

/**
 * The zyzz compiler for the explorer, shared by Vite and both Vitest configs.
 *
 * Tooling and server-only modules hold no styles. Keeping them out of the
 * source graph stops the compiler from resolving worker-only and test
 * dependencies through the browser and SSR optimizers.
 */
export function explorerZyzz(options: explorerZyzz.Options = {}): Plugin[] {
	const builtins = options.builtins ?? 'client'
	return [
		...(builtins === 'none' ? [] : [cloudflareBuiltins(builtins)]),
		zyzz({
			exclude: [
				'scripts',
				'test',
				'vitest.config.ts',
				'vitest.node.config.ts',
				'src/index.server.ts',
				// These import `@tanstack/react-start/server`, which TanStack's
				// import protection rejects when resolved for the browser.
				'src/lib/env.ts',
				'src/wagmi.config.ts',
				'src/lib/server',
				'src/routes/api',
				'src/workers',
			],
			reset: options.reset,
			script: false,
		}),
	]
}

export declare namespace explorerZyzz {
	type Options = {
		/**
		 * Environments that resolve `cloudflare:*` builtins as external. Use
		 * `'none'` where a Workers runtime resolves them itself.
		 */
		builtins?: 'all' | 'client' | 'none' | undefined
		/** Include zyzz's base reset. */
		reset?: boolean | undefined
	}
}

// Zyzz walks physical source in every environment. Some route modules import
// `cloudflare:*` builtins, which only the worker runtime provides. The client
// build strips those imports, and tests never execute them, so the compiler
// may treat them as external.
function cloudflareBuiltins(builtins: 'all' | 'client'): Plugin {
	return {
		name: 'explorer:cloudflare-builtins',
		enforce: 'pre',
		applyToEnvironment: (environment) =>
			builtins === 'all' || environment.name === 'client',
		resolveId(id) {
			if (id.startsWith('cloudflare:')) return { id, external: true }
		},
	}
}
