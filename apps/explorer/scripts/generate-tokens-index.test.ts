import { describe, expect, it, vi } from 'vitest'

const mockQueryBuilder = vi.hoisted(() => {
	class MockQueryBuilder {
		private responses: unknown[] = []

		setResponses(responses: unknown[]): void {
			this.responses = [...responses]
		}

		withSignatures(): this {
			return this
		}

		selectFrom(): this {
			return this
		}

		select(): this {
			return this
		}

		orderBy(): this {
			return this
		}

		async execute(): Promise<unknown> {
			if (this.responses.length === 0)
				throw new Error('No mock responses queued')
			return this.responses.shift()
		}
	}

	return new MockQueryBuilder()
})

vi.mock('../src/lib/server/tempo-queries-provider.ts', () => ({
	tempoQueryBuilder: () => mockQueryBuilder,
}))

import {
	SUPPORTED_CHAINS,
	fetchTokensForChain,
	formatTokensIndex,
	parseRequestedChains,
} from './generate-tokens-index.ts'

describe('generate-tokens-index', () => {
	it('parses all into all supported chains', () => {
		expect(parseRequestedChains('all')).toEqual([...SUPPORTED_CHAINS])
	})

	it('parses a supported chain id', () => {
		expect(parseRequestedChains('42431')).toEqual([42431])
	})

	it('throws for unsupported chain ids', () => {
		expect(() => parseRequestedChains('42429')).toThrow(
			/Supported chains: 31318, 42431, 4217/,
		)
	})

	it('formats token tuples exactly like the old generator output', () => {
		expect(
			formatTokensIndex([
				['0xaaa', 'AAA', 'Alpha'],
				['0xbbb', 'BBB', 'Beta'],
			]),
		).toBe(
			'[\n' +
				'\t["0xaaa","AAA","Alpha"],\n' +
				'\t["0xbbb","BBB","Beta"]\n' +
				']\n',
		)
	})

	it('maps tidx tokencreated rows into lowercase token tuples', async () => {
		vi.stubEnv('TIDX_BASIC_AUTH', 'user:pass')

		mockQueryBuilder.setResponses([
			[
				{
					token: '0xABCDEF',
					symbol: 'TOK',
					name: 'Token',
				},
			],
		])

		await expect(fetchTokensForChain(42431)).resolves.toEqual([
			['0xabcdef', 'TOK', 'Token'],
		])
	})
})
