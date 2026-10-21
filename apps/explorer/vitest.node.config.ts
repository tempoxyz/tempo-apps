import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	// Node tests import domain modules that transitively reach components, and
	// those import `~icons/*`. Without the resolver the whole file fails to load
	// and vitest reports a failed suite with zero tests — easy to miss, since
	// `pnpm test` uses the other config, which excludes these files entirely.
	plugins: [Icons({ compiler: 'jsx', jsx: 'react' })],
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ['test/**/*.node.test.ts'],
	},
})
