import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { app } from '#index.tsx'
import * as DB from '#database/schema.ts'
import { seedNativeContracts } from '../../scripts/precompile-seed/seed.ts'
import {
	nativeContractsManifest,
	tip20Manifest,
	zonePortalManifest,
	zoneMessengerManifest,
	zoneVerifierManifest,
} from '../../scripts/precompile-seed/manifest.ts'

const chainId = 4217
const token = '0x20c0000000000000000000000000000000001234'

type SourceResponse = {
	abi: unknown
	sources: Record<string, { content: string }>
}

async function seed() {
	await seedNativeContracts(drizzle(env.CONTRACTS_DB, { schema: DB }), {
		fetch: async (url) => new Response(`// Source fixture: ${url}`),
	})
}

function mockCode(code: string, address = token) {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async (_input, init) => {
			const request = JSON.parse(String(init?.body)) as {
				method: string
				params: unknown[]
				id: number
			}
			expect(request.method).toBe('eth_getCode')
			expect(request.params).toEqual([address, 'latest'])
			return Response.json({ jsonrpc: '2.0', id: request.id, result: code })
		})
}

afterEach(() => vi.restoreAllMocks())

describe('native precompile source coverage', () => {
	it('serves the missing fixed precompiles and pathUSD with their ABI and source provenance', async () => {
		await seed()
		const expected = [
			[
				'0x4d50500000000000000000000000000000000000',
				'TIP-20 Channel Reserve',
				'T5',
			],
			[
				'0xb10c000000000000000000000000000000000000',
				'Receive Policy Guard',
				'T6',
			],
			['0xc077e00000000000000000000000000000000000', 'Current Committee', 'T8'],
			['0x5af2000000000000000000000000000000000000', 'Zone Factory', 'T10'],
			['0x1060000000000000000000000000000000000000', 'Storage Credits', 'T7'],
			['0x20c0000000000000000000000000000000000000', 'TIP-20', null],
		] as const
		for (const [address, name, protocolVersion] of expected) {
			const response = await app.request(
				`/v2/contract/${chainId}/${address}?fields=name,abi,sources,extensions.tempo.nativeSource`,
				{},
				env,
			)
			expect(response.status).toBe(200)
			const body = (await response.json()) as SourceResponse
			expect(body).toMatchObject({
				address,
				name,
				extensions: {
					tempo: {
						nativeSource: {
							kind: 'precompile',
							bytecodeVerified: false,
							commit: tip20Manifest.commit,
							activation: { protocolVersion },
						},
					},
				},
			})
			const entry = nativeContractsManifest.find((item) => item.name === name)
			if (!entry) throw new Error(`Missing manifest entry: ${name}`)
			expect(body.abi).toEqual(entry.abi)
			expect(Object.keys(body.sources).sort()).toEqual([...entry.paths].sort())
		}
	})

	it('serves an initialized token using shared sources and the requested address', async () => {
		await seed()
		const rpc = mockCode('0xef')
		const response = await app.request(
			`/v2/contract/${chainId}/${token}?fields=all`,
			{},
			env,
		)
		expect(response.status).toBe(200)
		expect(rpc).toHaveBeenCalledTimes(1)
		const body = (await response.json()) as SourceResponse
		expect(body).toMatchObject({
			address: token,
			chainId: String(chainId),
			name: 'TIP-20',
			matchId: `native:native:tip20:${chainId}:${token}`,
			deployment: {
				address: token,
				chainId: String(chainId),
				blockNumber: null,
			},
			extensions: { tempo: { nativeSource: { bytecodeVerified: false } } },
		})
		expect(body.abi).toEqual(tip20Manifest.abi)
		expect(Object.keys(body.sources).sort()).toEqual(
			[...tip20Manifest.paths].sort(),
		)
	})

	it.each([
		'0x',
		'0x60006000',
		'0xef00',
	])('rejects a prefix address with code %s', async (code) => {
		await seed()
		mockCode(code)
		const response = await app.request(
			`/v2/contract/${chainId}/${token}`,
			{},
			env,
		)
		expect(response.status).toBe(404)
		expect(await response.json()).toMatchObject({
			customCode: 'contract_not_found',
		})
	})

	it('does not query RPC for an unrelated address or an unseeded token template', async () => {
		const rpc = mockCode('0xef')
		const unseeded = await app.request(
			`/v2/contract/${chainId}/${token}`,
			{},
			env,
		)
		expect(unseeded.status).toBe(404)
		await seed()
		const unrelated = await app.request(
			`/v2/contract/${chainId}/0x20c1000000000000000000000000000000001234`,
			{},
			env,
		)
		expect(unrelated.status).toBe(404)
		expect(rpc).not.toHaveBeenCalled()
	})
})

const portal1 = '0x5ad0000000000000000000000000000000000001'
const portal2 = '0x5ad0000000000000000000000000000000000002'
const portalProxyCode =
	'0x363d3d373d3d3d363d735ad10000000000000000000000000000000000005af43d82803e903d91602b57fd5bf3'

describe('zone system contract source coverage', () => {
	it.each([
		zonePortalManifest,
		zoneMessengerManifest,
		zoneVerifierManifest,
	])('serves the $name singleton with pinned Solidity sources', async (entry) => {
		await seed()
		const address = entry.deployments.find(
			(item) => item.chainId === chainId,
		)?.address
		const rpc = mockCode('0x')
		const response = await app.request(
			`/v2/contract/${chainId}/${address}?fields=all`,
			{},
			env,
		)
		expect(response.status).toBe(200)
		const body = (await response.json()) as SourceResponse
		expect(body).toMatchObject({
			name: entry.name,
			abi: entry.abi,
			language: 'Solidity',
			extensions: {
				tempo: {
					nativeSource: {
						kind: 'system_contract',
						bytecodeVerified: false,
						repository: 'tempoxyz/zones',
						commit: entry.commit,
						entrypoints: entry.entrypoints,
					},
				},
			},
		})
		expect(Object.keys(body.sources).sort()).toEqual([...entry.paths].sort())
		expect(rpc).not.toHaveBeenCalled()
	})

	it.each([
		portal1,
		portal2,
	])('resolves initialized portal %s without storing an instance', async (address) => {
		await seed()
		mockCode(portalProxyCode, address)
		const db = drizzle(env.CONTRACTS_DB, { schema: DB })
		const before = await db.select().from(DB.nativeContractsTable)
		const response = await app.request(
			`/v2/contract/${chainId}/${address}?fields=all`,
			{},
			env,
		)
		expect(response.status).toBe(200)
		const body = (await response.json()) as SourceResponse
		expect(body).toMatchObject({
			address,
			name: `Zone Portal Proxy #${BigInt(`0x${address.slice(-16)}`)}`,
			matchId: `native:native:zone-portal:${chainId}:${address}`,
			abi: zonePortalManifest.abi,
			deployment: { address, chainId: String(chainId), transactionHash: null },
			extensions: {
				tempo: {
					nativeSource: {
						bytecodeVerified: false,
						commit: zonePortalManifest.commit,
					},
				},
			},
		})
		expect(Object.keys(body.sources).sort()).toEqual(
			[...zonePortalManifest.paths].sort(),
		)
		expect(await db.select().from(DB.nativeContractsTable)).toEqual(before)
	})

	it.each([
		'0x',
		'0xef',
		'0x60006000',
		portalProxyCode.replace('5ad1', '5ad2'),
	])('rejects an uninitialized portal or unexpected proxy runtime %s', async (code) => {
		await seed()
		mockCode(code, portal1)
		const response = await app.request(
			`/v2/contract/${chainId}/${portal1}`,
			{},
			env,
		)
		expect(response.status).toBe(404)
	})

	it('does not query RPC for an unseeded implementation or invalid portal IDs', async () => {
		const rpc = mockCode(portalProxyCode, portal1)
		expect(
			(await app.request(`/v2/contract/${chainId}/${portal1}`, {}, env)).status,
		).toBe(404)
		await seed()
		for (const address of [
			'0x5ad0000000000000000000000000000000000000',
			'0x5ad0000000000000000000000000000100000000',
			'0x5ad0000100000000000000000000000000000001',
		]) {
			expect(
				(await app.request(`/v2/contract/${chainId}/${address}`, {}, env))
					.status,
			).toBe(404)
		}
		expect(rpc).not.toHaveBeenCalled()
	})
})
