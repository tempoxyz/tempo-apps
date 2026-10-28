import { tempo } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
	expiringNonceKey,
	getNonce,
	getNonceKey,
	isSubblockNonceKey,
} from '#lib/domain/nonce'

describe('isSubblockNonceKey', () => {
	it('matches nonce keys whose top byte is 0x5b', () => {
		expect(isSubblockNonceKey((0x5bn << 248n) | 42n)).toBe(true)
	})

	it('rejects expiring, 2D and protocol nonce keys', () => {
		expect(isSubblockNonceKey(expiringNonceKey)).toBe(false)
		expect(isSubblockNonceKey(0x5bn)).toBe(false)
		expect(isSubblockNonceKey(0n)).toBe(false)
		expect(isSubblockNonceKey(undefined)).toBe(false)
	})
})

describe('getNonceKey', () => {
	it('reads bigint and hex nonce keys', () => {
		expect(getNonceKey({ nonceKey: 7n })).toBe(7n)
		expect(getNonceKey({ nonceKey: '0x5b' })).toBe(0x5bn)
		expect(getNonceKey({ nonce: 1 })).toBeUndefined()
	})
})

describe('getNonce', () => {
	it('prefers the exact nonce', () => {
		expect(
			getNonce({
				nonce: Number(0x4fcaa49b83b6fe89n),
				nonceExact: 0x4fcaa49b83b6fe89n,
			}),
		).toBe(0x4fcaa49b83b6fe89n)
		expect(getNonce({ nonce: 7 })).toBe(7n)
	})
})

describe('tempo transaction formatter', () => {
	// Mainnet tx 0x9fc040aa…2b07 carries a TIP-1106 discriminator above 2^53.
	it('formats an expiring nonce above 2^53 exactly', () => {
		const formatted = tempo.formatters?.transaction?.format({
			accessList: [],
			calls: [
				{
					input: '0x',
					to: '0x20c0000000000000000000006a37da5c996874be',
					value: '0x0',
				},
			],
			chainId: '0x1079',
			from: '0xfb4346e029e23d5275a9d87ff07b816a28b0a70f',
			gas: '0xf4240',
			hash: '0x9fc040aa4fa17e776c725bc11835055eaf1b11a6c77f9b742d02d0fdbdcd2b07',
			maxFeePerGas: '0x47868c00',
			maxPriorityFeePerGas: '0x0',
			nonce: '0x4fcaa49b83b6fe89',
			nonceKey: `0x${'ff'.repeat(32)}`,
			signature: { r: '0x1', s: '0x1', type: 'secp256k1', yParity: '0x1' },
			type: '0x76',
		} as never)
		expect(formatted && getNonce(formatted)).toBe(0x4fcaa49b83b6fe89n)
	})
})
