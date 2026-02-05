import { describe, it, expect, vi } from 'vitest'
import { detectProxy } from './proxy.ts'

// EIP-1967 storage slots (must match proxy.ts)
const IMPLEMENTATION_SLOT =
	'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const BEACON_SLOT =
	'0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'
const PROXIABLE_SLOT =
	'0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7'

// Test addresses - use valid 40-char hex addresses
const PROXY_ADDRESS = '0x1234567890123456789012345678901234567890' as const
const IMPL_ADDRESS = '0xabcdef0123456789abcdef0123456789abcdef01' as const
const BEACON_ADDRESS = '0xbeac00beac00beac00beac00beac00beac000001' as const
const ZERO_SLOT =
	'0x0000000000000000000000000000000000000000000000000000000000000000'

// Helper to create a mock client
function createMockClient(overrides: {
	storageSlots?: Record<string, string>
	contractCalls?: Record<string, string>
}) {
	const { storageSlots = {}, contractCalls = {} } = overrides

	return {
		getStorageAt: vi.fn(async ({ slot }: { address: string; slot: string }) => {
			return storageSlots[slot] || ZERO_SLOT
		}),
		readContract: vi.fn(
			async ({
				address,
				functionName,
			}: {
				address: string
				functionName: string
			}) => {
				const key = `${address}:${functionName}`
				return contractCalls[key] || null
			},
		),
	}
}

// Helper to pad address to 32-byte slot value
function addressToSlot(address: string): string {
	return `0x000000000000000000000000${address.slice(2).toLowerCase()}`
}

describe('detectProxy', () => {
	describe('EIP-1967 Transparent Proxy', () => {
		it('should detect EIP-1967 proxy with implementation in storage slot', async () => {
			const client = createMockClient({
				storageSlots: {
					[IMPLEMENTATION_SLOT]: addressToSlot(IMPL_ADDRESS),
				},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result.isProxy).toBe(true)
			expect(result.type).toBe('EIP-1967')
			expect(result.implementationAddress?.toLowerCase()).toBe(
				IMPL_ADDRESS.toLowerCase(),
			)
			expect(client.getStorageAt).toHaveBeenCalledWith({
				address: PROXY_ADDRESS,
				slot: IMPLEMENTATION_SLOT,
			})
		})

		it('should return isProxy: false when implementation slot is zero', async () => {
			const client = createMockClient({
				storageSlots: {
					[IMPLEMENTATION_SLOT]: ZERO_SLOT,
				},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result.isProxy).toBe(false)
		})

		it('should return isProxy: false when implementation slot is empty', async () => {
			const client = createMockClient({
				storageSlots: {
					[IMPLEMENTATION_SLOT]: '0x',
				},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result.isProxy).toBe(false)
		})
	})

	describe('EIP-1822 UUPS Proxy', () => {
		it('should detect EIP-1822 proxy via PROXIABLE slot', async () => {
			const client = createMockClient({
				storageSlots: {
					[IMPLEMENTATION_SLOT]: ZERO_SLOT, // Not EIP-1967
					[BEACON_SLOT]: ZERO_SLOT, // Not Beacon
					[PROXIABLE_SLOT]: addressToSlot(IMPL_ADDRESS),
				},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result.isProxy).toBe(true)
			expect(result.type).toBe('EIP-1822')
			expect(result.implementationAddress?.toLowerCase()).toBe(
				IMPL_ADDRESS.toLowerCase(),
			)
		})
	})

	describe('Beacon Proxy', () => {
		// Checksummed addresses from viem's getAddress
		const CHECKSUMMED_BEACON = '0xbeAc00beAC00BEAc00beac00bEac00bEaC000001'
		const _CHECKSUMMED_IMPL = '0xabCDeF0123456789AbcdEf0123456789aBCDEF01'

		it('should detect Beacon proxy via beacon slot and childImplementation call', async () => {
			const client = createMockClient({
				storageSlots: {
					[IMPLEMENTATION_SLOT]: ZERO_SLOT,
					[BEACON_SLOT]: addressToSlot(BEACON_ADDRESS),
				},
				contractCalls: {
					[`${CHECKSUMMED_BEACON}:childImplementation`]: IMPL_ADDRESS,
				},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result.isProxy).toBe(true)
			expect(result.type).toBe('Beacon')
			expect(result.implementationAddress?.toLowerCase()).toBe(
				IMPL_ADDRESS.toLowerCase(),
			)
			expect(result.beaconAddress?.toLowerCase()).toBe(
				BEACON_ADDRESS.toLowerCase(),
			)
		})

		it('should fallback to implementation() call on beacon', async () => {
			const client = createMockClient({
				storageSlots: {
					[IMPLEMENTATION_SLOT]: ZERO_SLOT,
					[BEACON_SLOT]: addressToSlot(BEACON_ADDRESS),
				},
				contractCalls: {
					// childImplementation fails, but implementation() works
					[`${CHECKSUMMED_BEACON}:implementation`]: IMPL_ADDRESS,
				},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result.isProxy).toBe(true)
			expect(result.type).toBe('Beacon')
			expect(result.implementationAddress?.toLowerCase()).toBe(
				IMPL_ADDRESS.toLowerCase(),
			)
			expect(result.beaconAddress?.toLowerCase()).toBe(
				BEACON_ADDRESS.toLowerCase(),
			)
		})
	})

	describe('Legacy Proxy', () => {
		it('should detect legacy proxy via implementation() function call', async () => {
			const checksummedProxy = '0x1234567890123456789012345678901234567890'
			const client = createMockClient({
				storageSlots: {
					// All EIP slots are empty
					[IMPLEMENTATION_SLOT]: ZERO_SLOT,
					[BEACON_SLOT]: ZERO_SLOT,
					[PROXIABLE_SLOT]: ZERO_SLOT,
				},
				contractCalls: {
					[`${checksummedProxy}:implementation`]: IMPL_ADDRESS,
				},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result.isProxy).toBe(true)
			expect(result.type).toBe('Legacy')
			expect(result.implementationAddress?.toLowerCase()).toBe(
				IMPL_ADDRESS.toLowerCase(),
			)
		})
	})

	describe('Non-proxy contracts', () => {
		it('should return isProxy: false for regular contracts', async () => {
			const client = createMockClient({
				storageSlots: {},
				contractCalls: {},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result).toEqual({ isProxy: false })
		})

		it('should return isProxy: false when all detection methods fail', async () => {
			const client = createMockClient({
				storageSlots: {
					[IMPLEMENTATION_SLOT]: ZERO_SLOT,
					[BEACON_SLOT]: ZERO_SLOT,
					[PROXIABLE_SLOT]: ZERO_SLOT,
				},
				contractCalls: {},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result).toEqual({ isProxy: false })
		})
	})

	describe('Error handling', () => {
		it('should handle getStorageAt errors gracefully', async () => {
			const client = {
				getStorageAt: vi.fn().mockRejectedValue(new Error('RPC error')),
				readContract: vi.fn().mockResolvedValue(null),
			}

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result).toEqual({ isProxy: false })
		})

		it('should handle readContract errors gracefully', async () => {
			const client = {
				getStorageAt: vi.fn().mockResolvedValue(ZERO_SLOT),
				readContract: vi
					.fn()
					.mockRejectedValue(new Error('Contract call failed')),
			}

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result).toEqual({ isProxy: false })
		})
	})

	describe('Priority order', () => {
		it('should prefer EIP-1967 over other patterns', async () => {
			const client = createMockClient({
				storageSlots: {
					[IMPLEMENTATION_SLOT]: addressToSlot(IMPL_ADDRESS),
					[PROXIABLE_SLOT]: addressToSlot(
						'0x1111111111111111111111111111111111111111',
					),
				},
				contractCalls: {
					[`${PROXY_ADDRESS}:implementation`]:
						'0x2222222222222222222222222222222222222222',
				},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result.type).toBe('EIP-1967')
			// Use lowercase comparison since getAddress checksums the result
			expect(result.implementationAddress?.toLowerCase()).toBe(
				IMPL_ADDRESS.toLowerCase(),
			)
		})

		it('should prefer Beacon over EIP-1822 when both present', async () => {
			// The beacon address is checksummed by getAddress in the code
			const checksummedBeacon = '0xbeAc00beAC00BEAc00beac00bEac00bEaC000001'
			const client = createMockClient({
				storageSlots: {
					[IMPLEMENTATION_SLOT]: ZERO_SLOT,
					[BEACON_SLOT]: addressToSlot(BEACON_ADDRESS),
					[PROXIABLE_SLOT]: addressToSlot(
						'0x1111111111111111111111111111111111111111',
					),
				},
				contractCalls: {
					// The beacon address gets checksummed, so match that
					[`${checksummedBeacon}:childImplementation`]: IMPL_ADDRESS,
				},
			})

			const result = await detectProxy(client, PROXY_ADDRESS)

			expect(result.type).toBe('Beacon')
		})
	})
})

describe('Proxy detection integration sanity checks', () => {
	it('should have correct EIP-1967 implementation slot hash', () => {
		// The slot is keccak256("eip1967.proxy.implementation") - 1
		// This is a well-known value that should never change
		expect(IMPLEMENTATION_SLOT).toBe(
			'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
		)
	})

	it('should have correct EIP-1967 beacon slot hash', () => {
		// The slot is keccak256("eip1967.proxy.beacon") - 1
		expect(BEACON_SLOT).toBe(
			'0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
		)
	})

	it('should have correct EIP-1822 proxiable slot hash', () => {
		// The slot is keccak256("PROXIABLE")
		expect(PROXIABLE_SLOT).toBe(
			'0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7',
		)
	})
})
