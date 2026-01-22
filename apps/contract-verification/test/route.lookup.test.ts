import { env, SELF } from 'cloudflare:test'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hex } from 'ox'
import { keccak256 } from 'viem'
import { describe, expect, it } from 'vitest'

import {
	codeTable,
	compiledContractsSignaturesTable,
	compiledContractsSourcesTable,
	compiledContractsTable,
	contractDeploymentsTable,
	contractsTable,
	signaturesTable,
	sourcesTable,
	verifiedContractsTable,
} from '#database/schema.ts'

const AUDIT_USER = 'test'
const TEST_ADDRESS = '0x1234567890123456789012345678901234567890'

const toSha256 = async (value: string): Promise<Uint8Array> =>
	new Uint8Array(
		await globalThis.crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(value),
		),
	)

const insertCode = async (
	db: ReturnType<typeof drizzle>,
	bytecode: `0x${string}`,
): Promise<Uint8Array> => {
	const codeHash = await toSha256(bytecode)
	const codeHashKeccak = Hex.toBytes(keccak256(bytecode))
	await db
		.insert(codeTable)
		.values({
			codeHash,
			codeHashKeccak,
			code: Hex.toBytes(bytecode),
			createdBy: AUDIT_USER,
			updatedBy: AUDIT_USER,
		})
		.onConflictDoNothing()
	return codeHash
}

const seedVerifiedContract = async ({
	chainId,
	address,
	withSources,
	withSignatures,
}: {
	chainId: number
	address: `0x${string}`
	withSources?: boolean
	withSignatures?: boolean
}): Promise<{ matchId: number }> => {
	const db = drizzle(env.CONTRACTS_DB)
	const runtimeBytecode = '0x6000600055' as const
	const creationBytecode = '0x60006000556000' as const

	const runtimeCodeHash = await insertCode(db, runtimeBytecode)
	const creationCodeHash = await insertCode(db, creationBytecode)

	const existingContract = await db
		.select({ id: contractsTable.id })
		.from(contractsTable)
		.where(
			and(
				eq(contractsTable.creationCodeHash, creationCodeHash),
				eq(contractsTable.runtimeCodeHash, runtimeCodeHash),
			),
		)
		.limit(1)

	const contractId = existingContract[0]?.id ?? globalThis.crypto.randomUUID()

	if (!existingContract[0]) {
		await db.insert(contractsTable).values({
			id: contractId,
			creationCodeHash,
			runtimeCodeHash,
			createdBy: AUDIT_USER,
			updatedBy: AUDIT_USER,
		})
	}

	const deploymentId = globalThis.crypto.randomUUID()
	await db.insert(contractDeploymentsTable).values({
		id: deploymentId,
		chainId,
		address: Hex.toBytes(address),
		contractId,
		createdBy: AUDIT_USER,
		updatedBy: AUDIT_USER,
	})

	const existingCompilation = await db
		.select({ id: compiledContractsTable.id })
		.from(compiledContractsTable)
		.where(
			and(
				eq(compiledContractsTable.runtimeCodeHash, runtimeCodeHash),
				eq(compiledContractsTable.creationCodeHash, creationCodeHash),
				eq(compiledContractsTable.compiler, 'solc'),
				eq(compiledContractsTable.version, '0.8.20'),
				eq(compiledContractsTable.language, 'Solidity'),
			),
		)
		.limit(1)

	const compilationId =
		existingCompilation[0]?.id ?? globalThis.crypto.randomUUID()

	if (!existingCompilation[0]) {
		await db.insert(compiledContractsTable).values({
			id: compilationId,
			compiler: 'solc',
			version: '0.8.20',
			language: 'Solidity',
			name: 'SimpleStorage',
			fullyQualifiedName: 'SimpleStorage.sol:SimpleStorage',
			compilerSettings: JSON.stringify({}),
			compilationArtifacts: JSON.stringify({
				abi: [],
				metadata: {},
				storageLayout: null,
			}),
			creationCodeHash,
			creationCodeArtifacts: JSON.stringify({}),
			runtimeCodeHash,
			runtimeCodeArtifacts: JSON.stringify({}),
			createdBy: AUDIT_USER,
			updatedBy: AUDIT_USER,
		})
	}

	if (withSources) {
		const sourceContent = 'contract SimpleStorage { }'
		const contentBytes = new TextEncoder().encode(sourceContent)
		const sourceHash = new Uint8Array(
			await globalThis.crypto.subtle.digest('SHA-256', contentBytes),
		)
		const sourceHashKeccak = Hex.toBytes(keccak256(Hex.fromBytes(contentBytes)))

		await db
			.insert(sourcesTable)
			.values({
				sourceHash,
				sourceHashKeccak,
				content: sourceContent,
				createdBy: AUDIT_USER,
				updatedBy: AUDIT_USER,
			})
			.onConflictDoNothing()

		await db
			.insert(compiledContractsSourcesTable)
			.values({
				id: globalThis.crypto.randomUUID(),
				compilationId,
				sourceHash,
				path: 'contracts/SimpleStorage.sol',
			})
			.onConflictDoNothing()
	}

	if (withSignatures) {
		const signature = 'setValue(uint256)'
		const signatureHash32 = Hex.toBytes(keccak256(Hex.fromString(signature)))

		await db
			.insert(signaturesTable)
			.values({
				signatureHash32,
				signature,
			})
			.onConflictDoNothing()

		await db
			.insert(compiledContractsSignaturesTable)
			.values({
				id: globalThis.crypto.randomUUID(),
				compilationId,
				signatureHash32,
				signatureType: 'function',
			})
			.onConflictDoNothing()
	}

	await db.insert(verifiedContractsTable).values({
		deploymentId,
		compilationId,
		creationMatch: true,
		runtimeMatch: true,
		creationMetadataMatch: true,
		runtimeMetadataMatch: true,
		createdBy: AUDIT_USER,
		updatedBy: AUDIT_USER,
	})

	const match = await db
		.select({ id: verifiedContractsTable.id })
		.from(verifiedContractsTable)
		.where(
			and(
				eq(verifiedContractsTable.deploymentId, deploymentId),
				eq(verifiedContractsTable.compilationId, compilationId),
			),
		)
		.limit(1)

	return { matchId: match[0]?.id ?? 0 }
}

describe('GET /v2/contract/:chainId/:address', () => {
	const chainId = env.TEST_CHAIN_ID

	it('returns minimal response for verified contract', async () => {
		await seedVerifiedContract({ chainId, address: TEST_ADDRESS })

		const response = await SELF.fetch(
			`http://localhost/v2/contract/${chainId}/${TEST_ADDRESS}`,
		)

		expect(response.status).toBe(200)
		const body = (await response.json()) as {
			matchId: string
			match: string
			creationMatch: string
			runtimeMatch: string
			chainId: string
			address: string
		}
		expect(body.chainId).toBe(String(chainId))
		expect(body.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase())
		expect(body.match).toBe('exact_match')
		expect(body.runtimeMatch).toBe('exact_match')
		expect(body.creationMatch).toBe('exact_match')
		expect(body.matchId).toBeDefined()
	})

	it('returns full response when fields=all', async () => {
		await seedVerifiedContract({
			chainId,
			address: TEST_ADDRESS,
			withSources: true,
			withSignatures: true,
		})

		const response = await SELF.fetch(
			`http://localhost/v2/contract/${chainId}/${TEST_ADDRESS}?fields=all`,
		)

		expect(response.status).toBe(200)
		const body = (await response.json()) as {
			sources?: Record<string, { content: string }>
			signatures?: {
				function: Array<{ signature: string }>
			}
			compiler?: string
		}
		expect(body.compiler).toBe('solc')
		expect(body.sources?.['contracts/SimpleStorage.sol']?.content).toBeDefined()
		expect(body.signatures?.function[0]?.signature).toBe('setValue(uint256)')
	})

	it('supports selecting explicit fields', async () => {
		await seedVerifiedContract({ chainId, address: TEST_ADDRESS })

		const response = await SELF.fetch(
			`http://localhost/v2/contract/${chainId}/${TEST_ADDRESS}?fields=abi`,
		)

		expect(response.status).toBe(200)
		const body = (await response.json()) as { abi?: unknown }
		expect(body.abi).toBeDefined()
	})

	it('supports omitting fields', async () => {
		await seedVerifiedContract({
			chainId,
			address: TEST_ADDRESS,
			withSources: true,
			withSignatures: true,
		})

		const response = await SELF.fetch(
			`http://localhost/v2/contract/${chainId}/${TEST_ADDRESS}?omit=abi,metadata`,
		)

		expect(response.status).toBe(200)
		const body = (await response.json()) as {
			abi?: unknown
			metadata?: unknown
		}
		expect(body.abi).toBeUndefined()
		expect(body.metadata).toBeUndefined()
	})

	it('rejects unsupported chains', async () => {
		const response = await SELF.fetch(
			`http://localhost/v2/contract/999999/${TEST_ADDRESS}`,
		)

		expect(response.status).toBe(400)
	})

	it('rejects invalid addresses', async () => {
		const response = await SELF.fetch(
			`http://localhost/v2/contract/${chainId}/0xinvalid`,
		)

		expect(response.status).toBe(400)
	})

	it('returns 404 for missing contracts', async () => {
		const response = await SELF.fetch(
			`http://localhost/v2/contract/${chainId}/${TEST_ADDRESS}`,
		)

		expect(response.status).toBe(404)
	})

	it('rejects fields+omit together', async () => {
		await seedVerifiedContract({ chainId, address: TEST_ADDRESS })

		const response = await SELF.fetch(
			`http://localhost/v2/contract/${chainId}/${TEST_ADDRESS}?fields=all&omit=abi`,
		)

		expect(response.status).toBe(400)
	})
})

describe('GET /v2/contract/all-chains/:address', () => {
	const chainId = env.TEST_CHAIN_ID
	const secondaryChainId = chainId === 31318 ? 42431 : 31318

	it('returns verified contracts across chains', async () => {
		await seedVerifiedContract({ chainId, address: TEST_ADDRESS })
		await seedVerifiedContract({
			chainId: secondaryChainId,
			address: TEST_ADDRESS,
		})

		const response = await SELF.fetch(
			`http://localhost/v2/contract/all-chains/${TEST_ADDRESS}`,
		)

		expect(response.status).toBe(200)
		const body = (await response.json()) as {
			results: Array<{ chainId: string; address: string }>
		}
		expect(body.results).toHaveLength(2)
		const chainIds = body.results.map((result) => result.chainId)
		expect(chainIds).toContain(String(chainId))
		expect(chainIds).toContain(String(secondaryChainId))
	})
})

describe('GET /v2/contracts/:chainId', () => {
	const chainId = env.TEST_CHAIN_ID

	it('lists verified contracts for a chain', async () => {
		const { matchId: firstMatchId } = await seedVerifiedContract({
			chainId,
			address: TEST_ADDRESS,
		})
		await seedVerifiedContract({
			chainId,
			address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		})

		const response = await SELF.fetch(
			`http://localhost/v2/contracts/${chainId}?sort=asc&limit=1`,
		)

		expect(response.status).toBe(200)
		const body = (await response.json()) as {
			results: Array<{ matchId: string }>
		}
		expect(body.results).toHaveLength(1)
		expect(body.results[0]?.matchId).toBe(String(firstMatchId))
	})

	it('paginates using afterMatchId', async () => {
		const { matchId: firstMatchId } = await seedVerifiedContract({
			chainId,
			address: TEST_ADDRESS,
		})
		await seedVerifiedContract({
			chainId,
			address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		})

		const response = await SELF.fetch(
			`http://localhost/v2/contracts/${chainId}?sort=asc&afterMatchId=${firstMatchId}`,
		)

		expect(response.status).toBe(200)
		const body = (await response.json()) as {
			results: Array<{ matchId: string }>
		}
		expect(body.results).toHaveLength(1)
		expect(body.results[0]?.matchId).not.toBe(String(firstMatchId))
	})
})
