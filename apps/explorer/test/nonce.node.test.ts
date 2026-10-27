import { tempo } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
	exactNonce,
	expiringNonceKey,
	getNonceKey,
	isSubblockNonceKey,
	withLargeNonces,
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

describe('withLargeNonces', () => {
	const chain = withLargeNonces(tempo)
	// Mainnet tx 0x9fc040aa…2b07, an expiring nonce transfer with a TIP-1106 discriminator.
	const rpcTransaction = {
		type: '0x76',
		chainId: '0x1079',
		feeToken: '0x20c0000000000000000000000000000000000000',
		maxPriorityFeePerGas: '0x0',
		maxFeePerGas: '0x47868c00',
		gas: '0xf4240',
		calls: [
			{
				to: '0x20c0000000000000000000006a37da5c996874be',
				value: '0x0',
				input: '0x',
				data: null,
			},
		],
		accessList: [],
		nonceKey:
			'0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
		nonce: '0x4fcaa49b83b6fe89',
		feePayerSignature: null,
		validBefore: '0x6ae0cded',
		validAfter: null,
		keyAuthorization: null,
		aaAuthorizationList: [],
		signature: {
			type: 'secp256k1',
			r: '0x1f43af44d2bb7676280189f1a25b794a4b4d9638e2d38c7b19783939491d74dc',
			s: '0x8854e6525eb75047d28576747e79f99d55624e6f784fd0a2816d436cdec6065',
			yParity: '0x1',
			v: '0x1',
		},
		hash: '0x9fc040aa4fa17e776c725bc11835055eaf1b11a6c77f9b742d02d0fdbdcd2b07',
		blockHash:
			'0xbfeb6597ac2aa153ba350ceefdc154cb401ad9832c07eeea9ae72096747cab11',
		blockNumber: '0x2c05812',
		transactionIndex: '0x0',
		from: '0xfb4346e029e23d5275a9d87ff07b816a28b0a70f',
		gasPrice: '0x23c34600',
		blockTimestamp: '0x6ae0cdb1',
	}

	it('formats a transaction with a nonce above 2^53', () => {
		expect(() =>
			tempo.formatters?.transaction?.format(rpcTransaction as never),
		).toThrow()
		const formatted = chain.formatters?.transaction?.format(
			rpcTransaction as never,
		)
		expect(formatted?.nonce).toBe(Number(0x4fcaa49b83b6fe89n))
		expect(formatted?.hash).toBe(rpcTransaction.hash)
	})

	it('formats a block containing one', () => {
		const formatted = chain.formatters?.block?.format({
			number: '0x2c05812',
			hash: rpcTransaction.blockHash,
			transactions: [rpcTransaction, { ...rpcTransaction, nonce: '0x5' }],
		} as never) as { transactions: { nonce: number }[] }
		expect(formatted.transactions.map((tx) => tx.nonce)).toEqual([
			Number(0x4fcaa49b83b6fe89n),
			5,
		])
	})
})
