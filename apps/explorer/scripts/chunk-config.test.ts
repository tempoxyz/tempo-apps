import { describe, expect, it } from 'vitest'
import {
	extractPackageName,
	getVendorChunk,
	VENDOR_CHUNKS,
} from './chunk-config'

describe('extractPackageName', () => {
	it('returns undefined for non-node_modules paths', () => {
		expect(extractPackageName('/src/components/Button.tsx')).toBeUndefined()
		expect(extractPackageName('./lib/utils.ts')).toBeUndefined()
	})

	it('extracts regular package names', () => {
		expect(extractPackageName('/node_modules/react/index.js')).toBe('react')
		expect(extractPackageName('/node_modules/viem/dist/index.js')).toBe('viem')
		expect(extractPackageName('/app/node_modules/lodash/get.js')).toBe('lodash')
	})

	it('extracts scoped package names', () => {
		expect(
			extractPackageName('/node_modules/@tanstack/react-query/dist/index.js'),
		).toBe('@tanstack/react-query')
		expect(extractPackageName('/node_modules/@types/react/index.d.ts')).toBe(
			'@types/react',
		)
	})

	it('handles nested node_modules (hoisted deps)', () => {
		expect(
			extractPackageName(
				'/project/node_modules/.pnpm/react@18.0.0/node_modules/react/index.js',
			),
		).toBe('react')
	})
})

describe('getVendorChunk', () => {
	describe('server builds (isClientBuild = false)', () => {
		it('returns undefined for all modules to avoid browser code in server', () => {
			expect(getVendorChunk('/src/App.tsx', false)).toBeUndefined()
			expect(
				getVendorChunk('/node_modules/react/index.js', false),
			).toBeUndefined()
			expect(
				getVendorChunk(
					'/node_modules/@tanstack/react-query/dist/index.js',
					false,
				),
			).toBeUndefined()
		})
	})

	describe('client builds (isClientBuild = true)', () => {
		it('returns undefined for non-vendor modules', () => {
			expect(getVendorChunk('/src/App.tsx', true)).toBeUndefined()
			expect(getVendorChunk('./components/Button.tsx', true)).toBeUndefined()
		})

		it('returns undefined for unlisted vendor packages', () => {
			expect(
				getVendorChunk('/node_modules/lodash/index.js', true),
			).toBeUndefined()
			expect(getVendorChunk('/node_modules/zod/index.js', true)).toBeUndefined()
		})

		it('matches react packages', () => {
			expect(getVendorChunk('/node_modules/react/index.js', true)).toBe(
				'vendor-react',
			)
			expect(getVendorChunk('/node_modules/react-dom/client.js', true)).toBe(
				'vendor-react',
			)
			expect(getVendorChunk('/node_modules/scheduler/index.js', true)).toBe(
				'vendor-react',
			)
		})

		it('matches tanstack packages by prefix', () => {
			expect(
				getVendorChunk(
					'/node_modules/@tanstack/react-query/dist/index.js',
					true,
				),
			).toBe('vendor-tanstack')
			expect(
				getVendorChunk(
					'/node_modules/@tanstack/react-router/dist/index.js',
					true,
				),
			).toBe('vendor-tanstack')
			expect(
				getVendorChunk(
					'/node_modules/@tanstack/query-core/dist/index.js',
					true,
				),
			).toBe('vendor-tanstack')
		})

		it('matches web3 packages', () => {
			expect(getVendorChunk('/node_modules/viem/dist/index.js', true)).toBe(
				'vendor-web3',
			)
			expect(getVendorChunk('/node_modules/wagmi/dist/index.js', true)).toBe(
				'vendor-web3',
			)
			expect(getVendorChunk('/node_modules/ox/dist/index.js', true)).toBe(
				'vendor-web3',
			)
			expect(getVendorChunk('/node_modules/abitype/dist/index.js', true)).toBe(
				'vendor-web3',
			)
		})
	})
})

describe('VENDOR_CHUNKS config', () => {
	it('has expected chunk categories', () => {
		expect(Object.keys(VENDOR_CHUNKS)).toEqual(['react', 'tanstack', 'web3'])
	})

	it('react chunk has exact package list', () => {
		expect(VENDOR_CHUNKS.react).toEqual(['react', 'react-dom', 'scheduler'])
	})

	it('tanstack chunk uses prefix matching', () => {
		expect(VENDOR_CHUNKS.tanstack).toBe('@tanstack/')
	})

	it('web3 chunk has exact package list', () => {
		expect(VENDOR_CHUNKS.web3).toEqual(['viem', 'wagmi', 'ox', 'abitype'])
	})
})
