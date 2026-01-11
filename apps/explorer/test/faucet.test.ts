import { describe, expect, it, vi } from 'vitest'
import type { Address, Client, Hash } from 'viem'
import { fundAddress } from '../src/lib/faucet'

describe('fundAddress', () => {
	it('should call tempo_fundAddress with correct params', async () => {
		const mockTxHashes = [
			'0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
			'0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
		] as Hash[]

		const mockClient = {
			request: vi.fn().mockResolvedValue(mockTxHashes),
		} as unknown as Client

		const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address

		const result = await fundAddress(mockClient, testAddress)

		expect(mockClient.request).toHaveBeenCalledWith({
			method: 'tempo_fundAddress',
			params: [testAddress],
		})
		expect(result).toEqual(mockTxHashes)
	})

	it('should return an array of transaction hashes', async () => {
		const mockTxHashes = [
			'0x1111111111111111111111111111111111111111111111111111111111111111',
			'0x2222222222222222222222222222222222222222222222222222222222222222',
			'0x3333333333333333333333333333333333333333333333333333333333333333',
			'0x4444444444444444444444444444444444444444444444444444444444444444',
		] as Hash[]

		const mockClient = {
			request: vi.fn().mockResolvedValue(mockTxHashes),
		} as unknown as Client

		const result = await fundAddress(
			mockClient,
			'0x0000000000000000000000000000000000000000' as Address,
		)

		expect(Array.isArray(result)).toBe(true)
		expect(result).toHaveLength(4)
		expect(result).toEqual(mockTxHashes)
	})

	it('should handle RPC errors', async () => {
		const mockClient = {
			request: vi
				.fn()
				.mockRejectedValue(new Error('RPC Error: Rate limit exceeded')),
		} as unknown as Client

		const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address

		await expect(fundAddress(mockClient, testAddress)).rejects.toThrow(
			'RPC Error: Rate limit exceeded',
		)
	})

	it('should validate address format is passed correctly', async () => {
		const mockClient = {
			request: vi.fn().mockResolvedValue([]),
		} as unknown as Client

		const validAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address

		await fundAddress(mockClient, validAddress)

		expect(mockClient.request).toHaveBeenCalledWith(
			expect.objectContaining({
				params: [validAddress],
			}),
		)
	})
})
