import * as z from 'zod/mini'
import { Hex } from 'ox'
import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'

import * as DB from '#database/schema.ts'
import { app } from '#index.tsx'
import { chainIds } from '#wagmi.config.ts'

describe('gET /v2/contract/all-chains/:address', () => {
	it('returns 400 for invalid address', async () => {
		const response = await app.request(
			'/v2/contract/all-chains/invalid-address',
			{},
			env,
		)

		expect(response.status).toBe(400)
	})

	it('returns verified contracts for a valid address', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const chainId = chainIds[0]
		const address = '0x1111111111111111111111111111111111111111'
		const addressBytes = Hex.toBytes(address)
		const runtimeHash = new Uint8Array(32).fill(1)
		const creationHash = new Uint8Array(32).fill(2)
		const codeHashKeccak = new Uint8Array(32).fill(3)

		await db.insert(DB.codeTable).values([
			{ codeHash: runtimeHash, codeHashKeccak, code: new Uint8Array([1]) },
			{ codeHash: creationHash, codeHashKeccak, code: new Uint8Array([2]) },
		])

		const contractId = crypto.randomUUID()
		await db.insert(DB.contractsTable).values({
			id: contractId,
			creationCodeHash: creationHash,
			runtimeCodeHash: runtimeHash,
		})

		const deploymentId = crypto.randomUUID()
		await db.insert(DB.contractDeploymentsTable).values({
			id: deploymentId,
			chainId,
			address: addressBytes,
			contractId,
		})

		const compilationId = crypto.randomUUID()
		await db.insert(DB.compiledContractsTable).values({
			id: compilationId,
			compiler: 'solc',
			version: '0.8.20',
			language: 'Solidity',
			name: 'Token',
			fullyQualifiedName: 'Token.sol:Token',
			compilerSettings: '{}',
			compilationArtifacts: '{}',
			creationCodeHash: creationHash,
			creationCodeArtifacts: '{}',
			runtimeCodeHash: runtimeHash,
			runtimeCodeArtifacts: '{}',
		})

		await db.insert(DB.verifiedContractsTable).values({
			deploymentId,
			compilationId,
			creationMatch: true,
			runtimeMatch: true,
			creationMetadataMatch: true,
			runtimeMetadataMatch: true,
		})

		const response = await app.request(
			`/v2/contract/all-chains/${address}`,
			{},
			env,
		)

		expect(response.status).toBe(200)
		const body = z.parse(
			z.object({ results: z.array(z.object({ address: z.string() })) }),
			await response.json(),
		)
		expect(body.results).toHaveLength(1)
		expect(body.results.at(0)?.address).toBe(address)
	})
})

describe('gET /v2/contract/:chainId/:address', () => {
	it('returns 400 for invalid chain ID format', async () => {
		const response = await app.request(
			'/v2/contract/invalid/0x1234567890123456789012345678901234567890',
			{},
			env,
		)

		expect(response.status).toBe(400)

		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('invalid_chain_id')
	})

	it('returns 400 for unsupported chain ID', async () => {
		const response = await app.request(
			'/v2/contract/999999/0x1234567890123456789012345678901234567890',
			{},
			env,
		)

		expect(response.status).toBe(400)

		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('invalid_chain_id')
	})

	it('returns 400 for invalid address format', async () => {
		const response = await app.request('/v2/contract/1/not-an-address', {}, env)

		expect(response.status).toBe(400)
	})
})

describe('gET /v2/contracts/:chainId', () => {
	it('returns 400 for invalid chain ID', async () => {
		const response = await app.request('/v2/contracts/invalid', {}, env)

		expect(response.status).toBe(400)
	})

	it('returns 400 for unsupported chain ID', async () => {
		const response = await app.request('/v2/contracts/999999', {}, env)

		expect(response.status).toBe(400)

		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('invalid_chain_id')
	})
})
