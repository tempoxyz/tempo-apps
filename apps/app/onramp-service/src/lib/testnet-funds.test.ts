import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processWithIdempotency, type IdempotencyStore } from './testnet-funds'

describe('testnet-funds', () => {
	describe('processWithIdempotency', () => {
		let mockStore: IdempotencyStore

		beforeEach(() => {
			mockStore = {
				get: vi.fn(),
				put: vi.fn(),
			}
		})

		it('should return cached result if already processed', async () => {
			const cachedResult = {
				txHash: '0xabc123',
				amount: 50,
				destinationAddress: '0x1234567890123456789012345678901234567890',
			}

			vi.mocked(mockStore.get).mockResolvedValue(JSON.stringify(cachedResult))

			const processor = vi.fn()

			const result = await processWithIdempotency(
				mockStore,
				'pi_test_123',
				processor,
			)

			expect(result).toEqual(cachedResult)
			expect(processor).not.toHaveBeenCalled()
			expect(mockStore.get).toHaveBeenCalledWith('pi_test_123')
		})

		it('should process and cache result if not already processed', async () => {
			vi.mocked(mockStore.get).mockResolvedValue(null)
			vi.mocked(mockStore.put).mockResolvedValue(undefined)

			const processorResult = {
				txHash: '0xdef456',
				amount: 100,
				destinationAddress: '0x9876543210987654321098765432109876543210',
			}

			const processor = vi.fn().mockResolvedValue(processorResult)

			const result = await processWithIdempotency(
				mockStore,
				'pi_new_123',
				processor,
			)

			expect(result).toEqual(processorResult)
			expect(processor).toHaveBeenCalled()
			expect(mockStore.put).toHaveBeenCalledWith('pi_new_123', 'processing', {
				expirationTtl: 86400,
			})
			expect(mockStore.put).toHaveBeenCalledWith(
				'pi_new_123',
				JSON.stringify(processorResult),
				{ expirationTtl: 86400 * 30 },
			)
		})

		it('should mark as failed and rethrow if processor fails', async () => {
			vi.mocked(mockStore.get).mockResolvedValue(null)
			vi.mocked(mockStore.put).mockResolvedValue(undefined)

			const error = new Error('Transaction failed')
			const processor = vi.fn().mockRejectedValue(error)

			await expect(
				processWithIdempotency(mockStore, 'pi_fail_123', processor),
			).rejects.toThrow('Transaction failed')

			expect(mockStore.put).toHaveBeenCalledWith('pi_fail_123', 'processing', {
				expirationTtl: 86400,
			})
			expect(mockStore.put).toHaveBeenCalledWith('pi_fail_123', 'failed', {
				expirationTtl: 3600,
			})
		})

		it('should not reprocess if marked as processing', async () => {
			vi.mocked(mockStore.get).mockResolvedValue('processing')

			const processor = vi.fn()

			const result = await processWithIdempotency(
				mockStore,
				'pi_processing_123',
				processor,
			)

			expect(result).toBeNull()
			expect(processor).not.toHaveBeenCalled()
		})
	})
})
