import { Hex } from 'ox'
import * as z from 'zod/mini'
import { eq } from 'drizzle-orm'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'
import { describe, it, expect } from 'vitest'

import { app } from '#index.tsx'
import * as DB from '#database/schema.ts'
import { chainIds } from '#wagmi.config.ts'
import { validatorConfigV2Manifest } from '../../scripts/precompile-seed/manifest.ts'

async function insertNativePrecompileFixture(): Promise<{
	nativeContractId: string
	chainId: number
	address: string
	commitSha: string
	commitUrl: string
	fromBlock: number
	protocolVersion: string
	paths: readonly string[]
	entrypoints: readonly string[]
	sourceIds: Record<string, string>
}> {
	const db = drizzle(env.CONTRACTS_DB)
	const chainId = chainIds.includes(4217) ? 4217 : chainIds[0]
	if (!chainId) {
		throw new Error('expected at least one configured chain ID')
	}

	const deployment = validatorConfigV2Manifest.deployments.find(
		(deployment_) => deployment_.chainId === chainId,
	)
	if (!deployment) {
		throw new Error(
			`missing validator config v2 deployment for chain ${chainId}`,
		)
	}

	const address = deployment.address
	const addressBytes = Hex.toBytes(address)
	const commitSha = validatorConfigV2Manifest.commit
	const commitUrl = validatorConfigV2Manifest.commitUrl
	const fromBlock = 12345678
	const protocolVersion = 'T2'
	const paths = validatorConfigV2Manifest.paths
	const entrypoints = validatorConfigV2Manifest.entrypoints
	const sourceHashes = paths.map((_, index) =>
		new Uint8Array(32).fill(
			index === 0 ? 0x11 : index === 1 ? 0x22 : 0x33 + index,
		),
	)
	const sourceIds = Object.fromEntries(
		paths.map((path, index) => {
			const sourceHash = sourceHashes.at(index)
			if (!sourceHash) {
				throw new Error(`missing source hash for ${path}`)
			}
			return [path, Hex.fromBytes(sourceHash)]
		}),
	)

	const nativeContractId = crypto.randomUUID()
	await db.insert(DB.nativeContractsTable).values({
		id: nativeContractId,
		chainId,
		address: addressBytes,
		name: 'Validator Config V2',
		runtimeType: 'precompile',
		language: 'Rust',
		abiJson: JSON.stringify(validatorConfigV2Manifest.abi),
	})

	const revisionId = crypto.randomUUID()
	await db.insert(DB.nativeContractRevisionsTable).values({
		id: revisionId,
		nativeContractId,
		repo: validatorConfigV2Manifest.repository,
		commitSha,
		commitUrl,
		protocolVersion,
		fromBlock,
		toBlock: null,
		sourceRoot: validatorConfigV2Manifest.sourceRoot,
		snapshotStatus: 'complete',
	})

	await db.insert(DB.sourcesTable).values(
		paths.map((path, index) => {
			const sourceHash = sourceHashes.at(index)
			if (!sourceHash) {
				throw new Error(`missing source hash for ${path}`)
			}

			return {
				sourceHash,
				sourceHashKeccak: new Uint8Array(32).fill(0x33 + index),
				content:
					index === 0
						? 'pub struct ValidatorConfigV2 { /* ... */ }'
						: 'impl Precompile for ValidatorConfigV2 { /* ... */ }',
			}
		}),
	)

	await db.insert(DB.nativeContractRevisionSourcesTable).values(
		paths.map((path, index) => {
			const sourceHash = sourceHashes.at(index)
			if (!sourceHash) {
				throw new Error(`missing source hash for ${path}`)
			}

			return {
				id: crypto.randomUUID(),
				revisionId,
				sourceHash,
				path,
				isEntrypoint: entrypoints.includes(path),
			}
		}),
	)

	return {
		nativeContractId,
		chainId,
		address,
		commitSha,
		commitUrl,
		fromBlock,
		protocolVersion,
		paths,
		entrypoints,
		sourceIds,
	}
}

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

	it('returns native precompiles in the minimal all-chains response', async () => {
		const fixture = await insertNativePrecompileFixture()

		const response = await app.request(
			`/v2/contract/all-chains/${fixture.address}`,
			{},
			env,
		)

		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({
			results: [
				{
					matchId: `native:${fixture.nativeContractId}`,
					match: 'exact_match',
					creationMatch: 'exact_match',
					runtimeMatch: 'exact_match',
					chainId: String(fixture.chainId),
					address: fixture.address,
					verifiedAt: null,
				},
			],
		})
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

	it('returns Tempo native source data under extensions.tempo.nativeSource', async () => {
		const fixture = await insertNativePrecompileFixture()

		const response = await app.request(
			`/v2/contract/${fixture.chainId}/${fixture.address}?fields=abi,language,signatures,sources,sourceIds,extensions.tempo.nativeSource`,
			{},
			env,
		)

		expect(response.status).toBe(200)
		const firstPath = fixture.paths.at(0)
		const secondPath = fixture.paths.at(1)
		if (!firstPath || !secondPath) {
			throw new Error('expected at least two native source paths')
		}

		const body = (await response.json()) as {
			abi: Array<{ type: string; name?: string }>
			sources: Record<string, { content: string }>
			sourceIds: Record<string, string>
			extensions: {
				tempo: {
					nativeSource: {
						kind: string
						language: string
						bytecodeVerified: boolean
						repository: string
						commit: string
						commitUrl: string
						paths: string[]
						entrypoints: string[]
						activation: {
							protocolVersion: string | null
							fromBlock: string | null
							toBlock: string | null
						}
					}
				}
			}
		}

		expect(body).toMatchObject({
			matchId: `native:${fixture.nativeContractId}`,
			match: 'exact_match',
			creationMatch: 'exact_match',
			runtimeMatch: 'exact_match',
			chainId: String(fixture.chainId),
			address: fixture.address,
			verifiedAt: null,
			language: 'Rust',
			sources: {
				[firstPath]: {
					content: 'pub struct ValidatorConfigV2 { /* ... */ }',
				},
				[secondPath]: {
					content: 'impl Precompile for ValidatorConfigV2 { /* ... */ }',
				},
			},
			sourceIds: fixture.sourceIds,
			signatures: {
				function: expect.arrayContaining([
					expect.objectContaining({
						signature: 'getActiveValidators()',
					}),
					expect.objectContaining({
						signature: expect.stringContaining('addValidator('),
					}),
				]),
				event: expect.any(Array),
				error: expect.any(Array),
			},
			extensions: {
				tempo: {
					nativeSource: {
						kind: 'precompile',
						language: 'Rust',
						bytecodeVerified: false,
						repository: validatorConfigV2Manifest.repository,
						commit: fixture.commitSha,
						commitUrl: fixture.commitUrl,
						paths: [...fixture.paths],
						entrypoints: [...fixture.entrypoints],
						activation: {
							protocolVersion: fixture.protocolVersion,
							fromBlock: String(fixture.fromBlock),
							toBlock: null,
						},
					},
				},
			},
		})
		expect(body.abi).toEqual(validatorConfigV2Manifest.abi)
		expect(body.abi).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'function',
					name: 'getActiveValidators',
				}),
				expect.objectContaining({ type: 'function', name: 'addValidator' }),
			]),
		)
	})

	it('returns null activation.fromBlock for protocol-gated native sources without block metadata', async () => {
		const fixture = await insertNativePrecompileFixture()
		const db = drizzle(env.CONTRACTS_DB)

		await db
			.update(DB.nativeContractRevisionsTable)
			.set({ fromBlock: 0, protocolVersion: 'T2' })
			.where(eq(DB.nativeContractRevisionsTable.commitSha, fixture.commitSha))

		const response = await app.request(
			`/v2/contract/${fixture.chainId}/${fixture.address}?fields=extensions.tempo.nativeSource`,
			{},
			env,
		)

		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({
			matchId: `native:${fixture.nativeContractId}`,
			match: 'exact_match',
			creationMatch: 'exact_match',
			runtimeMatch: 'exact_match',
			chainId: String(fixture.chainId),
			address: fixture.address,
			verifiedAt: null,
			extensions: {
				tempo: {
					nativeSource: {
						kind: 'precompile',
						language: 'Rust',
						bytecodeVerified: false,
						repository: validatorConfigV2Manifest.repository,
						commit: fixture.commitSha,
						commitUrl: fixture.commitUrl,
						paths: [...fixture.paths],
						entrypoints: [...fixture.entrypoints],
						activation: {
							protocolVersion: 'T2',
							fromBlock: null,
							toBlock: null,
						},
					},
				},
			},
		})
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

	it('includes native precompiles in chain contract listings', async () => {
		const fixture = await insertNativePrecompileFixture()

		const response = await app.request(
			`/v2/contracts/${fixture.chainId}`,
			{},
			env,
		)

		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({
			results: [
				{
					matchId: `native:${fixture.nativeContractId}`,
					match: 'exact_match',
					creationMatch: 'exact_match',
					runtimeMatch: 'exact_match',
					chainId: String(fixture.chainId),
					address: fixture.address,
					verifiedAt: null,
				},
			],
		})
	})

	it('paginates into native precompiles after verified contracts', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const fixture = await insertNativePrecompileFixture()
		const chainId = fixture.chainId
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

		const firstPage = await app.request(
			`/v2/contracts/${fixture.chainId}?limit=1`,
			{},
			env,
		)
		expect(firstPage.status).toBe(200)

		const firstBody = z.parse(
			z.object({
				results: z.array(
					z.object({
						matchId: z.nullable(z.string()),
						address: z.string(),
					}),
				),
			}),
			await firstPage.json(),
		)
		expect(firstBody.results).toHaveLength(1)
		expect(firstBody.results[0]?.matchId).toMatch(/^\d+$/)

		const verifiedMatchId = firstBody.results[0]?.matchId
		if (!verifiedMatchId) {
			throw new Error('expected first page verified matchId')
		}

		const secondPage = await app.request(
			`/v2/contracts/${fixture.chainId}?limit=1&afterMatchId=${verifiedMatchId}`,
			{},
			env,
		)
		expect(secondPage.status).toBe(200)
		expect(await secondPage.json()).toEqual({
			results: [
				{
					matchId: `native:${fixture.nativeContractId}`,
					match: 'exact_match',
					creationMatch: 'exact_match',
					runtimeMatch: 'exact_match',
					chainId: String(fixture.chainId),
					address: fixture.address,
					verifiedAt: null,
				},
			],
		})
	})
})
