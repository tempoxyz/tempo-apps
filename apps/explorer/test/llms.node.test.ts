import { readFileSync } from 'node:fs'
import { toParams } from '@tempo/llms'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/mini'
import { getExplorerHostPolicy } from '#lib/explorer-indexing'
import { feeAmmSearchSchema } from '#lib/fee-amm'
import { liveQuerySchema } from '#lib/live-query'
import { zAddress, zHash } from '#lib/zod'
import wrangler from '#wrangler.json' with { type: 'json' }

const param = (schema: unknown, name: string) =>
	toParams(schema).find((item) => item.name === name)

describe('explorer schemas', () => {
	it('reads literal values and defaults', () => {
		expect(param(feeAmmSearchSchema, 'limit')).toMatchObject({
			types: [],
			values: ['10', '25', '50'],
			default: '10',
			required: false,
		})
		expect(param(liveQuerySchema, 'kind')).toMatchObject({
			values: ['account-transfers', 'token-transfers', 'transactions'],
			required: true,
		})
	})

	it('types addresses, hashes, and unions', () => {
		const schema = z.object({
			address: zAddress(),
			block: z.prefault(z.union([z.literal('latest'), zHash()]), 'latest'),
			calls: z.optional(z.array(z.array(z.string()))),
			page: z.prefault(z.coerce.number(), 1),
		})
		expect(toParams(schema)).toEqual([
			{
				name: 'address',
				types: ['hex'],
				values: [],
				default: undefined,
				required: true,
			},
			{
				name: 'block',
				types: ['hex'],
				values: ['latest'],
				default: 'latest',
				required: false,
			},
			{
				name: 'calls',
				types: ['string[][]'],
				values: [],
				default: undefined,
				required: false,
			},
			{
				name: 'page',
				types: ['number'],
				values: [],
				default: '1',
				required: false,
			},
		])
	})
})

describe('templates', () => {
	it.each([
		'llms.template.md',
		'llms-full.template.md',
	])('%s lists every wrangler.json network', (file) => {
		const template = readFileSync(
			new URL(`../src/lib/llms/${file}`, import.meta.url),
			'utf8',
		)
		for (const [name, env] of Object.entries(wrangler.env)) {
			const hosts = env.routes.map((route) => route.pattern)
			const aliases = hosts.filter((host) =>
				getExplorerHostPolicy(`https://${host}/`),
			)
			const primary = hosts.filter((host) => !aliases.includes(host))
			expect(template).toContain(
				`| ${name} | ${primary.map((host) => `https://${host}`).join(', ')} | ${aliases.join(', ') || '-'} |`,
			)
		}
	})
})
