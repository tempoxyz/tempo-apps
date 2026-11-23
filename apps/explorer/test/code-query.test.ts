import { expect, it, vi } from 'vitest'
vi.mock('#lib/env.ts', () => ({
	clientEnv: { CONTRACT_VERIFICATION_API_BASE_URL: 'https://verify.test' },
	getRequestURL: () => new URL('https://explore.test'),
}))
import { CodeQuerySchema } from '#routes/api/code'

it.each([
	[undefined, false],
	['false', false],
	['true', true],
])('parses highlight %s explicitly', (value, expected) => {
	const result = CodeQuerySchema.parse({
		chainid: '4217',
		address: `0x${'11'.repeat(20)}`,
		...(value === undefined ? {} : { highlight: value }),
	})
	expect(result.highlight).toBe(expected)
})
it.each([
	'0',
	'1',
	'yes',
	'FALSE',
])('rejects ambiguous highlight flag %s', (highlight) => {
	expect(
		CodeQuerySchema.safeParse({
			chainid: '4217',
			address: `0x${'11'.repeat(20)}`,
			highlight,
		}).success,
	).toBe(false)
})
