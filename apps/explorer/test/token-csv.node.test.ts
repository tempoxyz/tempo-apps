import { describe, expect, it } from 'vitest'
import type { Token } from '#lib/server/tokens'
import { serializeTokenCsv } from '#lib/token-csv'

function token(
	fields: Partial<Token> &
		Pick<Token, 'symbol' | 'name' | 'currency' | 'address'>,
): Token {
	return fields as Token
}

describe('serializeTokenCsv', () => {
	it('exports asymmetric rows in their supplied order and keeps missing numbers distinct from zero', () => {
		const rows = [
			token({
				symbol: 'BETA',
				name: 'Second row',
				currency: 'USD',
				holdersCount: 0,
				address: '0x222',
				createdAt: 0,
			}),
			token({
				symbol: 'ALPHA',
				name: 'First row',
				currency: 'EUR',
				address: '0x111',
			}),
		]

		expect(serializeTokenCsv(rows)).toBe(
			'Symbol,Name,Currency,Holders,Address,Created (Unix seconds)\r\n' +
				'BETA,Second row,USD,0,0x222,0\r\n' +
				'ALPHA,First row,EUR,,0x111,',
		)
	})

	it('quotes commas, quotes, and embedded newlines and preserves Unicode', () => {
		const rows = [
			token({
				symbol: 'TOK,EN',
				name: 'A "quoted" name\n第二行',
				currency: 'é,£',
				holdersCount: 12_345,
				address: '0xabc',
				createdAt: 1_700_000_001,
			}),
		]

		expect(serializeTokenCsv(rows)).toBe(
			'Symbol,Name,Currency,Holders,Address,Created (Unix seconds)\r\n' +
				'"TOK,EN","A ""quoted"" name\n第二行","é,£",12345,0xabc,1700000001',
		)
	})

	it('neutralizes formula-leading token text including formulas after whitespace', () => {
		const rows = [
			token({
				symbol: '=1+1',
				name: '  +SUM(A1:A2)',
				currency: '\t@malicious',
				holdersCount: undefined,
				address: '0x-safe',
				createdAt: undefined,
			}),
			token({
				symbol: '-cmd',
				name: '\r=1+1',
				currency: '\n@SUM(1)',
				address: '0x123',
			}),
		]

		expect(serializeTokenCsv(rows)).toBe(
			'Symbol,Name,Currency,Holders,Address,Created (Unix seconds)\r\n' +
				"'=1+1,'  +SUM(A1:A2),'\t@malicious,,0x-safe,\r\n" +
				'\'-cmd,"\'\r=1+1","\'\n@SUM(1)",,0x123,',
		)
	})

	it('leaves benign text intact', () => {
		const rows = [
			token({
				symbol: 'SAFE-1',
				name: 'Whitespace is okay ',
				currency: 'USD',
				address: '0xsafe',
			}),
		]

		expect(serializeTokenCsv(rows)).toBe(
			'Symbol,Name,Currency,Holders,Address,Created (Unix seconds)\r\n' +
				'SAFE-1,Whitespace is okay ,USD,,0xsafe,',
		)
	})
})
