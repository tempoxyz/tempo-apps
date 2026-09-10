import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHAIN_IDS } from '../src/chains.ts'
import app from '../src/index.tsx'
import { OpenAPISpec } from '../src/schema.ts'

const tokenListFor = (chainId: number) => ({
	name: `Tempo ${chainId}`,
	timestamp: '2026-08-25T00:00:00Z',
	version: { major: 1, minor: 0, patch: 0 },
	tokens: [
		{
			chainId,
			address: '0x20c0000000000000000000000000000000000000',
			decimals: 6,
			name: 'Path USD',
			symbol: 'pathUSD',
			logoURI: 'https://example.com/pathusd.png',
		},
	],
})

function mockTempoApi(options: { unavailableChainId?: number } = {}): void {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string | URL | Request) => {
			const url = new URL(
				input instanceof Request ? input.url : input.toString(),
			)
			const chainId = Number(url.searchParams.get('chainId'))
			if (chainId === options.unavailableChainId)
				return new Response('unavailable', { status: 503 })
			return Response.json(tokenListFor(chainId))
		}),
	)
}

const request = (path: string) => app.request(path, {}, {} as Cloudflare.Env)

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('tokenlist API contract', () => {
	it('preserves canonical Tempo API token list responses', async () => {
		mockTempoApi()

		const listResponse = await request('/list/4217')
		await expect(listResponse.json()).resolves.toEqual(tokenListFor(4217))

		const assetResponse = await request('/asset/4217/pathUSD')
		await expect(assetResponse.json()).resolves.toEqual(
			tokenListFor(4217).tokens[0],
		)

		const allResponse = await request('/lists/all')
		await expect(allResponse.json()).resolves.toEqual(
			CHAIN_IDS.map(tokenListFor),
		)
	})

	it('omits upstream failures from the all-lists response', async () => {
		mockTempoApi({ unavailableChainId: 42431 })

		const response = await request('/lists/all')
		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toEqual(
			CHAIN_IDS.filter((chainId) => chainId !== 42431).map(tokenListFor),
		)
	})

	it('documents the canonical proxy response shapes in OpenAPI', () => {
		expect(OpenAPISpec.components.schemas.AllTokenLists).toMatchObject({
			type: 'array',
			items: { $ref: '#/components/schemas/TokenList' },
		})

		expect(OpenAPISpec.components.schemas.TokenList.required).toEqual([
			'name',
			'timestamp',
			'version',
			'tokens',
		])

		expect(OpenAPISpec.components.schemas.TokenInfo.required).toEqual([
			'chainId',
			'address',
			'decimals',
			'name',
			'symbol',
		])
		expect(OpenAPISpec.components.schemas.TokenInfo.properties).toHaveProperty(
			'chainId',
		)
		expect(OpenAPISpec.components.schemas.TokenInfo.properties).toHaveProperty(
			'logoURI',
		)
	})

	it('keeps the version response and OpenAPI schema aligned', async () => {
		vi.stubGlobal('__BUILD_VERSION__', 'test-rev')

		const response = await request('/version')
		const version = await response.json()
		expect(version).toMatchObject({
			source: 'https://github.com/tempoxyz/tempo-apps',
			rev: 'test-rev',
			chains: CHAIN_IDS,
		})
		expect(version.timestamp).toEqual(expect.any(Number))

		const versionSchema =
			OpenAPISpec.paths['/version'].get.responses['200'].content[
				'application/json'
			].schema
		expect(versionSchema).toMatchObject({
			type: 'object',
			required: ['timestamp', 'source', 'rev', 'chains'],
			properties: {
				timestamp: { type: 'integer', format: 'int64' },
				source: { type: 'string', format: 'uri' },
				rev: { type: 'string' },
				chains: { type: 'array', items: { type: 'integer' } },
			},
		})
	})
})
