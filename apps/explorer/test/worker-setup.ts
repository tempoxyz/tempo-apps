import { vi } from 'vitest'

// Unit tests run outside TanStack's request context and Vite router plugin.
// Match the no-request behavior used by env.ts rather than resolving the
// framework's virtual #tanstack-router-entry module in the Workers pool.
vi.mock('@tanstack/react-start/server', () => ({
	getRequestUrl: () => {
		throw new Error('No request context in unit test')
	},
	getRequestHeader: () => undefined,
}))
