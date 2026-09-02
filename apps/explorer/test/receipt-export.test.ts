import { describe, expect, test } from 'vitest'
import { getReceiptResponseType } from '#lib/domain/receipt-export'

describe('getReceiptResponseType', () => {
	test.each([
		['/receipt/hash.txt', 'application/json', false, 'text/plain'],
		['/receipt/hash.json', 'text/plain', false, 'application/json'],
		['/receipt/hash.pdf', 'application/json', false, 'application/pdf'],
		['/receipt/hash', 'application/json', false, 'application/json'],
		['/receipt/hash', 'text/plain', false, 'text/plain'],
		['/receipt/hash', '*/*', true, 'text/plain'],
		['/receipt/hash', 'text/html', false, undefined],
	] as const)('negotiates %s independently of conflicting headers', (pathname, accept, isTerminal, expected) => {
		expect(getReceiptResponseType(pathname, accept, isTerminal)).toBe(expected)
	})
})
