import { defineConfig } from 'vitest/config'

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ['test/**/*.node.test.ts'],
	},
})
