import { describe, it, expect } from 'vitest'
import { VerificationCoalescer } from '@tempo/402-common'

describe('VerificationCoalescer', () => {
	it('should coalesce multiple concurrent verifications for the same hash', async () => {
		const coalescer = new VerificationCoalescer()
		let callCount = 0

		const verifyFn = async () => {
			callCount++
			// Simulate network latency
			await new Promise((resolve) => setTimeout(resolve, 50))
			return true
		}

		const hash = '0xabc'
		const [res1, res2, res3] = await Promise.all([
			coalescer.verify(hash, verifyFn),
			coalescer.verify(hash, verifyFn),
			coalescer.verify(hash, verifyFn),
		])

		expect(callCount).toBe(1) // Only one execution
		expect(res1).toBe(true)
		expect(res2).toBe(true)
		expect(res3).toBe(true)
	})

	it('should process different hashes independently', async () => {
		const coalescer = new VerificationCoalescer()
		let callCount = 0

		const verifyFn = async () => {
			callCount++
			return true
		}

		await Promise.all([
			coalescer.verify('0x1', verifyFn),
			coalescer.verify('0x2', verifyFn),
		])

		expect(callCount).toBe(2) // Two independent executions
	})

	it('should allow subsequent verifications of the same hash after completion', async () => {
		const coalescer = new VerificationCoalescer()
		let callCount = 0

		const verifyFn = async () => {
			callCount++
			return true
		}

		const hash = '0xabc'

		await coalescer.verify(hash, verifyFn)
		expect(callCount).toBe(1)

		await coalescer.verify(hash, verifyFn)
		expect(callCount).toBe(2) // New execution after completion
	})

	it('should track pending counts accurately', async () => {
		const coalescer = new VerificationCoalescer()
		expect(coalescer.getPendingCount()).toBe(0)

		const promise = coalescer.verify('0xabc', async () => {
			await new Promise((resolve) => setTimeout(resolve, 50))
			return true
		})

		expect(coalescer.getPendingCount()).toBe(1)
		await promise
		expect(coalescer.getPendingCount()).toBe(0)
	})
})
