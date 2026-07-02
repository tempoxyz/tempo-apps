import { describe, expect, it } from 'vitest'
import {
	toEnrichedTransaction,
	toTransferTransaction,
} from '#lib/server/address-history'

const SENDER = '0x286ad6cfc7279c8a6d86d15dcefcb77a65aa7e92'
const RECIPIENT = '0x20c0000000000000000000000000000000000003'
const HASH =
	'0x220935cf5b098cbea4d2b2a72ed3e156ad872743c593869d0223a9b93f06dd48'

function receipt(overrides: Record<string, unknown> = {}) {
	return {
		blockHash: null,
		blockNumber: 21_846_856,
		contractAddress: null,
		cumulativeGasUsed: 52_570,
		effectiveGasPrice: '20000000000',
		feeAmount: '1051',
		feePayer: SENDER,
		feeToken: RECIPIENT,
		gasUsed: 52_570,
		logs: [],
		recipient: RECIPIENT,
		sender: SENDER,
		status: 'success',
		timestamp: '2026-06-12T03:58:20.000Z',
		...overrides,
	}
}

function row(overrides: Record<string, unknown> = {}) {
	return {
		blockHash: null,
		blockNumber: 21_846_856,
		feeToken: RECIPIENT,
		gas: 56_474,
		hash: HASH,
		input: '0x',
		maxFeePerGas: '24000000000',
		maxPriorityFeePerGas: '0',
		meta: { receipt: receipt() },
		nonce: 9_388,
		recipient: RECIPIENT,
		sender: SENDER,
		timestamp: '2026-06-12T03:58:20.000Z',
		transactionIndex: 17,
		type: 'tempo',
		value: '12345',
		...overrides,
	} as never
}

describe('toEnrichedTransaction', () => {
	it('maps a Cadent row + humanized receipt to the UI contract', () => {
		const result = toEnrichedTransaction(row(), {
			includeKnownEvents: false,
			getTokenMetadata: () => undefined,
		})

		expect(result).toEqual({
			hash: HASH,
			blockNumber: '0x14d5b48',
			timestamp: Date.parse('2026-06-12T03:58:20.000Z') / 1000,
			from: '0x286ad6cfc7279C8a6D86D15dcEFcB77A65Aa7E92',
			to: '0x20C0000000000000000000000000000000000003',
			value: '0x3039',
			status: 'success',
			gasUsed: '0xcd5a',
			effectiveGasPrice: '0x4a817c800',
			knownEvents: [],
		})
	})

	it('defaults gas fields and status when the receipt is missing', () => {
		const result = toEnrichedTransaction(row({ meta: {} }), {
			includeKnownEvents: true,
			getTokenMetadata: () => undefined,
		})

		expect(result.status).toBe('success')
		expect(result.gasUsed).toBe('0x0')
		expect(result.effectiveGasPrice).toBe('0x0')
		expect(result.knownEvents).toEqual([])
	})

	it('marks reverted transactions from the receipt status', () => {
		const result = toEnrichedTransaction(
			row({ meta: { receipt: receipt({ status: 'reverted' }) } }),
			{ includeKnownEvents: false, getTokenMetadata: () => undefined },
		)

		expect(result.status).toBe('reverted')
	})
})

describe('toTransferTransaction', () => {
	it('maps an account transfer row to an event-backed transaction row', () => {
		const result = toTransferTransaction({
			blockNumber: 21_900_000,
			recipient: RECIPIENT,
			sender: SENDER,
			sourceToken: {
				address: '0x20c0000000000000000000000000000000000000',
				amount: '12345',
			},
			timestamp: '2026-06-24T12:00:00.000Z',
			transactionHash: HASH,
		} as never)

		expect(result.hash).toBe(HASH)
		expect(result.timestamp).toBe(Date.parse('2026-06-24T12:00:00.000Z') / 1000)
		expect(result.from).toBe('0x286ad6cfc7279C8a6D86D15dcEFcB77A65Aa7E92')
		expect(result.to).toBe('0x20C0000000000000000000000000000000000003')
		expect(result.knownEvents[0]).toMatchObject({
			type: 'send',
			meta: { from: result.from, to: result.to },
		})
		expect(result.knownEvents[0]?.parts[1]).toEqual({
			type: 'amount',
			value: {
				token: '0x20c0000000000000000000000000000000000000',
				value: '12345',
			},
		})
	})
})
