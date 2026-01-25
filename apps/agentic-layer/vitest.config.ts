import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
		setupFiles: ['./tests/setup.ts'],
		alias: {
			'@tempo/402-common': path.resolve(
				__dirname,
				'./packages/common/src/index.ts',
			),
			'@tempo/402-sdk': path.resolve(__dirname, './packages/sdk/src/index.ts'),
			'@tempo/402-server': path.resolve(
				__dirname,
				'./packages/server/src/index.ts',
			),
		},
	},
})
