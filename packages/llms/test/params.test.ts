import { describe, expect, it } from 'vitest'
import { z } from 'zod/mini'
import { format, toParams } from '../src/params'

const hex = () => z.string().check(format('hex'))

describe('toParams', () => {
	it.each([
		[
			'string literals',
			z.object({ tab: z.optional(z.enum(['raw', 'overview'])) }),
			{ types: [], values: ['overview', 'raw'], required: false },
		],
		[
			'numeric literals, sorted by size',
			z.object({
				limit: z._default(
					z.union([z.literal(50), z.literal(10), z.literal(25)]),
					10,
				),
			}),
			{ types: [], values: ['10', '25', '50'], default: '10', required: false },
		],
		[
			'a format and a literal',
			z.object({
				block: z.prefault(z.union([z.literal('latest'), hex()]), 'latest'),
			}),
			{
				types: ['hex'],
				values: ['latest'],
				default: 'latest',
				required: false,
			},
		],
		[
			'nested arrays',
			z.object({ calls: z.optional(z.array(z.array(z.string()))) }),
			{ types: ['string[][]'], values: [], required: false },
		],
		[
			'coerced numbers with a default',
			z.object({ page: z.prefault(z.coerce.number(), 1) }),
			{ types: ['number'], values: [], default: '1', required: false },
		],
		[
			'required fields',
			z.object({ address: hex() }),
			{ types: ['hex'], values: [], required: true },
		],
	])('reads %s', (_, schema, expected) => {
		const [param] = toParams(schema)
		expect(param).toMatchObject(expected)
	})

	it('returns no params without a schema', () => {
		expect(toParams(undefined)).toEqual([])
	})

	it('rejects a parse function', () => {
		expect(() => toParams(z.object({}).parse)).toThrow(/not `schema.parse`/)
	})
})
