import { describe, expect, it } from 'vitest'
import type { EnrichedTransaction } from '#lib/server/address-history'
import { serializeTransactionsCsv } from '#lib/transactions-csv'

function transaction(
	overrides: Partial<EnrichedTransaction> = {},
): EnrichedTransaction {
	return {
		hash: `0x${'1'.repeat(64)}`,
		blockNumber: '0x14d5b48',
		timestamp: 1_781_240_300,
		from: '0x286ad6cfc7279c8a6d86d15dcefcb77a65aa7e92',
		to: '0x20c0000000000000000000000000000000000003',
		value: '0x3039',
		status: 'success',
		gasUsed: '0xcd5a',
		effectiveGasPrice: '0x4a817c800',
		knownEvents: [],
		...overrides,
	}
}

const HEADER =
	'hash,blockNumber,timestamp,from,to,value,status,gasUsed,effectiveGasPrice'

describe('serializeTransactionsCsv', () => {
	it('writes a header and exports the transaction fields without changing their values', () => {
		expect(serializeTransactionsCsv([transaction()])).toBe(
			`${HEADER}\n0x${'1'.repeat(64)},0x14d5b48,1781240300,0x286ad6cfc7279c8a6d86d15dcefcb77a65aa7e92,0x20c0000000000000000000000000000000000003,0x3039,success,0xcd5a,0x4a817c800`,
		)
	})

	it('exports only the header when there are no transactions', () => {
		expect(serializeTransactionsCsv([])).toBe(HEADER)
	})

	it('quotes and escapes fields containing commas, quotes, and line breaks', () => {
		const row = transaction({
			from: '0xabc,"sender"\nsecond line' as `0x${string}`,
			to: null,
			status: 'reverted',
		})

		expect(serializeTransactionsCsv([row])).toBe(
			`${HEADER}\n0x${'1'.repeat(64)},0x14d5b48,1781240300,"0xabc,""sender""\nsecond line",,0x3039,reverted,0xcd5a,0x4a817c800`,
		)
	})
})
