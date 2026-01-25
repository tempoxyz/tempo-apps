import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyPaymentHash, type VerifyConfig } from '@tempo/402-common'
import * as viem from 'viem'

// Mock viem module
vi.mock('viem', async () => {
	const actual = (await vi.importActual('viem')) as any
	return {
		...actual,
		createPublicClient: vi.fn(),
		http: vi.fn(),
		decodeEventLog: vi.fn(),
		parseAbi: vi.fn(),
	}
})

describe('verifyPaymentHash', () => {
	const TX_HASH =
		'0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`
	const RECIPIENT = '0x1234567890123456789012345678901234567890'
	const TOKEN = '0x0987654321098765432109876543210987654321'
	const RPC_URL = 'https://rpc.moderato.tempo.xyz'
	const TRANSFER_TOPIC =
		'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

	const mockGetTransaction = vi.fn()
	const mockGetTransactionReceipt = vi.fn()
	const mockGetBlock = vi.fn()
	const mockGetBlockNumber = vi.fn()

	const config: VerifyConfig = {
		recipient: RECIPIENT,
		amount: '1000',
		token: TOKEN,
		rpcUrl: RPC_URL,
	}

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup mock transport
		;(viem.http as any).mockReturnValue('mock-transport')

		// Setup mock client
		mockGetBlockNumber.mockResolvedValue(100n)
		;(viem.createPublicClient as any).mockReturnValue({
			getTransaction: mockGetTransaction,
			getTransactionReceipt: mockGetTransactionReceipt,
			getBlock: mockGetBlock,
			getBlockNumber: mockGetBlockNumber,
		})

		// Default: valid Transfer event for the correct recipient and amount
		;(viem.decodeEventLog as any).mockReturnValue({
			eventName: 'Transfer',
			args: {
				to: RECIPIENT,
				value: BigInt(1000),
			},
		})
	})

	it('should return true when transaction is valid, targets correct token, and has valid Transfer event', async () => {
		mockGetTransaction.mockResolvedValue({
			to: TOKEN.toLowerCase(),
		})
		mockGetTransactionReceipt.mockResolvedValue({
			status: 'success',
			logs: [{ data: '0x', topics: [TRANSFER_TOPIC] }],
			blockNumber: 100n,
		})

		const result = await verifyPaymentHash(TX_HASH, config)
		expect(result).toBe(true)
	})

	it('should return false when transaction receipt status is not success', async () => {
		mockGetTransaction.mockResolvedValue({
			to: TOKEN,
		})
		mockGetTransactionReceipt.mockResolvedValue({
			status: 'reverted',
		})

		const result = await verifyPaymentHash(TX_HASH, config)
		expect(result).toBe(false)
	})

	it('should return false when transaction targets wrong token', async () => {
		mockGetTransaction.mockResolvedValue({
			to: '0xwrongTokenAddress0000000000000000000000',
		})
		mockGetTransactionReceipt.mockResolvedValue({
			status: 'success',
			blockNumber: 100n,
		})

		const result = await verifyPaymentHash(TX_HASH, config)
		expect(result).toBe(false)
	})

	it('should return false when Transfer event recipient is wrong', async () => {
		mockGetTransaction.mockResolvedValue({
			to: TOKEN.toLowerCase(),
		})
		mockGetTransactionReceipt.mockResolvedValue({
			status: 'success',
			logs: [{ data: '0x', topics: [] }],
		})
		;(viem.decodeEventLog as any).mockReturnValue({
			eventName: 'Transfer',
			args: {
				to: '0xwrongRecipient00000000000000000000000000',
				value: BigInt(1000),
			},
		})

		const result = await verifyPaymentHash(TX_HASH, config)
		expect(result).toBe(false)
	})

	it('should return false when Transfer event amount is too low', async () => {
		mockGetTransaction.mockResolvedValue({
			to: TOKEN.toLowerCase(),
		})
		mockGetTransactionReceipt.mockResolvedValue({
			status: 'success',
			logs: [{ data: '0x', topics: [] }],
		})
		;(viem.decodeEventLog as any).mockReturnValue({
			eventName: 'Transfer',
			args: {
				to: RECIPIENT,
				value: BigInt(999),
			},
		})

		const result = await verifyPaymentHash(TX_HASH, config)
		expect(result).toBe(false)
	})

	it('should return false when transaction fetch fails', async () => {
		mockGetTransaction.mockRejectedValue(new Error('Network error'))
		mockGetTransactionReceipt.mockRejectedValue(new Error('Network error'))

		const result = await verifyPaymentHash(TX_HASH, config)
		expect(result).toBe(false)
	})

	it('should handle transaction age validation if maxAgeSeconds is set', async () => {
		const configWithAge: VerifyConfig = { ...config, maxAgeSeconds: 300 }
		const currentTimestamp = Math.floor(Date.now() / 1000)

		mockGetBlock.mockResolvedValue({
			timestamp: BigInt(currentTimestamp - 600),
		}) // Too old
		mockGetTransaction.mockResolvedValue({ to: TOKEN })
		mockGetTransactionReceipt.mockResolvedValue({
			status: 'success',
			logs: [{ data: '0x', topics: [TRANSFER_TOPIC] }],
			blockNumber: 100n,
		})

		const result = await verifyPaymentHash(TX_HASH, configWithAge)
		expect(result).toBe(false)
	})
})
