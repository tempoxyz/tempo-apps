import { describe, expect, it } from 'vitest'
import { encodeFunctionData, parseAbi, zeroHash } from 'viem'
import {
	isZonePortalAddress,
	withdrawalQueueHashFromInput,
} from '../src/lib/domain/zones'

describe('Zone Portal presentation', () => {
	it('recognizes reserved Zone Portal addresses only', () => {
		expect(
			isZonePortalAddress('0x5ad0000000000000000000000000000000000001'),
		).toBe(true)
		expect(
			isZonePortalAddress('0x5ad00000000000000000000000000000ffffffff'),
		).toBe(true)
		expect(
			isZonePortalAddress('0x5ad0000000000000000000000000000000000000'),
		).toBe(false)
		expect(
			isZonePortalAddress('0x5ad1000000000000000000000000000000000000'),
		).toBe(false)
	})

	it('reconstructs the committed withdrawal queue hash from processing calldata', () => {
		const input = encodeFunctionData({
			abi: parseAbi([
				'function processWithdrawals((address token, bytes32 senderTag, address to, uint128 amount, bytes32 memo, uint64 gasLimit, uint64 fallbackNonce, bytes callbackData, bytes encryptedSender)[] withdrawals, bytes32 remainingQueue)',
			]),
			functionName: 'processWithdrawals',
			args: [
				[
					{
						token: '0x20c0000000000000000000000000000000000000',
						senderTag: `0x${'11'.repeat(32)}`,
						to: '0x8117E0ba6239B9695f780DEb010F72a2Fa4bdfb6',
						amount: 100n,
						memo: zeroHash,
						gasLimit: 0n,
						fallbackNonce: 1n,
						callbackData: '0x',
						encryptedSender: '0x',
					},
				],
				zeroHash,
			],
		})

		expect(withdrawalQueueHashFromInput(input)).toBe(
			'0x50c3f41591c910c4a8e89df89eafa1e212ac3241300afa1671fca791afdf9972',
		)
	})

	it('ignores calldata for other portal functions', () => {
		expect(withdrawalQueueHashFromInput('0x12345678')).toBeNull()
	})
})
