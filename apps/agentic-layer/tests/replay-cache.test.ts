import { describe, it, expect } from 'vitest'
import { ReplayProtection } from '@tempo/402-common'

describe('ReplayProtection', () => {
	it('should mark a new transaction as used', () => {
		const cache = new ReplayProtection()
		const txHash = '0x123'
		expect(cache.markUsed(txHash)).toBe(true)
	})

	it('should detect a replay attack for a recently used transaction', () => {
		const cache = new ReplayProtection()
		const txHash = '0x123'

		cache.markUsed(txHash)
		expect(cache.markUsed(txHash)).toBe(false)
	})

	it('should allow reusing a transaction after the TTL has expired', async () => {
		const ttl = 10 // 10ms
		const cache = new ReplayProtection(ttl)
		const txHash = '0x123'

		cache.markUsed(txHash)

		// Wait for > TTL
		await new Promise((resolve) => setTimeout(resolve, 20))

		expect(cache.markUsed(txHash)).toBe(true)
	})

	it('should handle multiple transactions independently', () => {
		const cache = new ReplayProtection()
		const tx1 = '0x111'
		const tx2 = '0x222'

		expect(cache.markUsed(tx1)).toBe(true)
		expect(cache.markUsed(tx2)).toBe(true)
		expect(cache.markUsed(tx1)).toBe(false)
		expect(cache.markUsed(tx2)).toBe(false)
	})
})
