import { QueryClient } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	batchAbiQueryOptions,
	lookupSignatureQueryOptions,
} from '#lib/queries/abi'

vi.mock('#lib/env.ts', () => ({ getApiUrl: (path: string) => path }))
vi.mock('#lib/domain/contracts', () => ({
	autoloadAbi: vi.fn(),
	lookupSignature: vi.fn(),
}))

afterEach(() => vi.unstubAllGlobals())

function mockBatch() {
	const batches: { addresses: Address[]; selectors: Hex[] }[] = []
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, init) => {
			const batch = JSON.parse(init.body)
			batches.push(batch)
			expect(
				batch.addresses.length + batch.selectors.length,
			).toBeLessThanOrEqual(50)
			return Response.json({
				abis: Object.fromEntries(
					batch.addresses.map((address: string) => [address, []]),
				),
				signatures: Object.fromEntries(
					batch.selectors.map((selector: string) => [selector, 'call()']),
				),
			})
		}),
	)
	return batches
}

describe('bounded ABI query batches', () => {
	it('splits a large trace across the address/selector boundary and merges results', async () => {
		const batches = mockBatch()
		const addresses = Array.from(
			{ length: 63 },
			(_, i) => `0x${i.toString(16).padStart(40, '0')}` as Address,
		)
		const selectors = Array.from(
			{ length: 61 },
			(_, i) => `0x${i.toString(16).padStart(8, '0')}` as Hex,
		)
		const data = await new QueryClient().fetchQuery(
			batchAbiQueryOptions({ addresses, selectors: [...selectors, '0x12'] }),
		)
		expect(
			batches.map(
				({ addresses, selectors }) => addresses.length + selectors.length,
			),
		).toEqual([50, 50, 24])
		expect(Object.keys(data.abis)).toHaveLength(63)
		expect(Object.keys(data.signatures)).toHaveLength(61)
	})

	it('splits coalesced browser lookups and keeps short calldata out of valid batches', async () => {
		vi.stubGlobal('window', {})
		const batches = mockBatch()
		const client = new QueryClient()
		const selectors = Array.from(
			{ length: 53 },
			(_, i) => `0x${i.toString(16).padStart(8, '0')}` as Hex,
		)
		const results = await Promise.all(
			[...selectors, '0x', '0x12', '0x1234', '0x123456'].map((selector) =>
				client.fetchQuery(
					lookupSignatureQueryOptions({ selector: selector as Hex }),
				),
			),
		)
		expect(batches.map(({ selectors }) => selectors.length)).toEqual([50, 3])
		expect(results.slice(0, 53)).toEqual(Array(53).fill('call()'))
		expect(results.slice(53)).toEqual([null, null, null, null])
		expect(lookupSignatureQueryOptions({ selector: '0x12' }).enabled).toBe(
			false,
		)
	})
})
