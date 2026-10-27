import { describe, expect, it } from 'vitest'
import {
	exactNonce,
	expiringNonceKey,
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

describe('exactNonce', () => {
	it('keeps a TIP-1106 uint64 discriminator exact', () => {
		const rpcNonce = '0xfffffffffffffffd'
		expect(exactNonce(Number(BigInt(rpcNonce)), rpcNonce)).toBe(
			18446744073709551613n,
		)
	})

	it('falls back to the formatted nonce', () => {
		expect(exactNonce(5, undefined)).toBe(5n)
	})
})
