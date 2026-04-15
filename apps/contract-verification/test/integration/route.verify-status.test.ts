import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hex, Hash } from 'ox'
import { describe, expect, it } from 'vitest'

import {
	codeTable,
	compiledContractsTable,
	contractDeploymentsTable,
	contractsTable,
	verifiedContractsTable,
	verificationJobsTable,
} from '#database/schema.ts'
import { app } from '#index.tsx'

function statusUrl(id: string): string {
	return `/v2/verify/${id}`
}

async function getStatus(id: string): Promise<Response> {
	return app.request(statusUrl(id), { method: 'GET' }, env)
}

const db = () => drizzle(env.CONTRACTS_DB)
const addressBytes = Hex.toBytes('0x1234567890abcdef1234567890abcdef12345678')

async function insertJob(
	overrides: Partial<{
		id: string
		startedAt: string
		completedAt: string | null
		verifiedContractId: number | null
		errorCode: string | null
		errorId: string | null
		errorData: string | null
		chainId: number
	}> = {},
): Promise<string> {
	const id = overrides.id ?? globalThis.crypto.randomUUID()
	await db()
		.insert(verificationJobsTable)
		.values({
			id,
			chainId: overrides.chainId ?? 185,
			contractAddress: addressBytes,
			verificationEndpoint: '/v2/verify',
			startedAt: overrides.startedAt ?? new Date().toISOString(),
			completedAt: overrides.completedAt ?? null,
			verifiedContractId: overrides.verifiedContractId ?? null,
			errorCode: overrides.errorCode ?? null,
			errorId: overrides.errorId ?? null,
			errorData: overrides.errorData ?? null,
		})
	return id
}

async function seedVerifiedContract(): Promise<number> {
	const d = db()
	const fakeRuntime = '0xdeadbeef'
	const fakeCreation = '0xcafebabe'
	const runtimeBytes = Hex.toBytes(fakeRuntime as `0x${string}`)
	const creationBytes = Hex.toBytes(fakeCreation as `0x${string}`)
	const runtimeHash = new Uint8Array(
		await globalThis.crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(fakeRuntime),
		),
	)
	const creationHash = new Uint8Array(
		await globalThis.crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(fakeCreation),
		),
	)
	const runtimeKeccak = Hex.toBytes(
		Hash.keccak256(fakeRuntime as `0x${string}`),
	)
	const creationKeccak = Hex.toBytes(
		Hash.keccak256(fakeCreation as `0x${string}`),
	)

	await d
		.insert(codeTable)
		.values([
			{
				codeHash: runtimeHash,
				codeHashKeccak: runtimeKeccak,
				code: runtimeBytes,
			},
			{
				codeHash: creationHash,
				codeHashKeccak: creationKeccak,
				code: creationBytes,
			},
		])
		.onConflictDoNothing()

	const contractId = globalThis.crypto.randomUUID()
	await d.insert(contractsTable).values({
		id: contractId,
		creationCodeHash: creationHash,
		runtimeCodeHash: runtimeHash,
	})

	const deploymentId = globalThis.crypto.randomUUID()
	await d.insert(contractDeploymentsTable).values({
		id: deploymentId,
		chainId: 185,
		address: addressBytes,
		contractId,
	})

	const compilationId = globalThis.crypto.randomUUID()
	await d.insert(compiledContractsTable).values({
		id: compilationId,
		compiler: 'solc',
		version: '0.8.20',
		language: 'Solidity',
		name: 'TestContract',
		fullyQualifiedName: 'contracts/Test.sol:TestContract',
		compilerSettings: '{}',
		compilationArtifacts: '{}',
		creationCodeHash: creationHash,
		creationCodeArtifacts: '{}',
		runtimeCodeHash: runtimeHash,
		runtimeCodeArtifacts: '{}',
	})

	await d.insert(verifiedContractsTable).values({
		deploymentId,
		compilationId,
		creationMatch: false,
		runtimeMatch: true,
		runtimeMetadataMatch: true,
	})

	const [row] = await d
		.select({ id: verifiedContractsTable.id })
		.from(verifiedContractsTable)
		.where(eq(verifiedContractsTable.deploymentId, deploymentId))
		.limit(1)

	if (!row) throw new Error('expected verified contract row')
	return row.id
}

describe('GET /v2/verify/:verificationId — status route', () => {
	it('returns 404 for an unknown UUID', async () => {
		const res = await getStatus('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
		expect(res.status).toBe(404)

		const body = (await res.json()) as {
			customCode: string
			message: string
			errorId: string
		}
		expect(body.customCode).toBe('not_found')
		expect(body.message).toContain('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
		expect(body.errorId).toBeTypeOf('string')
	})

	it('returns 404 for an unknown numeric id', async () => {
		const res = await getStatus('99999')
		expect(res.status).toBe(404)

		const body = (await res.json()) as { customCode: string }
		expect(body.customCode).toBe('not_found')
	})

	it('returns 404 for a non-UUID, non-numeric string', async () => {
		const res = await getStatus('not-a-valid-id!@#')
		expect(res.status).toBe(404)

		const body = (await res.json()) as { customCode: string }
		expect(body.customCode).toBe('not_found')
	})

	it('returns 404 for an empty-ish verificationId', async () => {
		const res = await getStatus('___')
		expect(res.status).toBe(404)

		const body = (await res.json()) as { customCode: string }
		expect(body.customCode).toBe('not_found')
	})

	it('returns 200 with isJobCompleted=false for a pending job', async () => {
		const jobId = await insertJob()
		const res = await getStatus(jobId)

		expect(res.status).toBe(200)
		const body = (await res.json()) as {
			isJobCompleted: boolean
			verificationId: string
			contract: {
				match: null
				creationMatch: null
				runtimeMatch: null
				chainId: string
				address: string
			}
		}

		expect(body.isJobCompleted).toBe(false)
		expect(body.verificationId).toBe(jobId)
		expect(body.contract.match).toBeNull()
		expect(body.contract.creationMatch).toBeNull()
		expect(body.contract.runtimeMatch).toBeNull()
		expect(body.contract.chainId).toBe('185')
		expect(body.contract.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
	})

	it('auto-expires a stale unfinished job on status poll', async () => {
		const staleDate = new Date(Date.now() - 20 * 60 * 1_000).toISOString()
		const jobId = await insertJob({ startedAt: staleDate })

		const res = await getStatus(jobId)
		expect(res.status).toBe(200)

		const body = (await res.json()) as {
			isJobCompleted: boolean
			verificationId: string
			contract: null
			error: { customCode: string; message: string; errorId: string }
		}

		expect(body.isJobCompleted).toBe(true)
		expect(body.verificationId).toBe(jobId)
		expect(body.contract).toBeNull()
		expect(body.error.customCode).toBe('timeout')
		expect(body.error.message).toContain('timed out')
		expect(body.error.errorId).toBeTypeOf('string')

		const [row] = await db()
			.select({
				completedAt: verificationJobsTable.completedAt,
				errorCode: verificationJobsTable.errorCode,
			})
			.from(verificationJobsTable)
			.where(eq(verificationJobsTable.id, jobId))
			.limit(1)

		expect(row?.completedAt).not.toBeNull()
		expect(row?.errorCode).toBe('timeout')
	})

	it('returns 200 with error details for a failed job', async () => {
		const errorId = globalThis.crypto.randomUUID()
		const jobId = await insertJob({
			completedAt: new Date().toISOString(),
			errorCode: 'compilation_failed',
			errorId,
			errorData: JSON.stringify({ message: 'solc crashed' }),
		})

		const res = await getStatus(jobId)
		expect(res.status).toBe(200)

		const body = (await res.json()) as {
			isJobCompleted: boolean
			verificationId: string
			contract: null
			error: { customCode: string; message: string; errorId: string }
		}

		expect(body.isJobCompleted).toBe(true)
		expect(body.verificationId).toBe(jobId)
		expect(body.contract).toBeNull()
		expect(body.error.customCode).toBe('compilation_failed')
		expect(body.error.message).toBe('solc crashed')
		expect(body.error.errorId).toBe(errorId)
	})

	it('uses fallback message when errorData has no message field', async () => {
		const jobId = await insertJob({
			completedAt: new Date().toISOString(),
			errorCode: 'internal_error',
			errorData: JSON.stringify({}),
		})

		const res = await getStatus(jobId)
		const body = (await res.json()) as {
			error: { message: string }
		}
		expect(body.error.message).toBe('Verification failed')
	})

	it('returns full contract details for a completed verification', async () => {
		const verifiedId = await seedVerifiedContract()
		const jobId = await insertJob({
			completedAt: new Date().toISOString(),
			verifiedContractId: verifiedId,
		})

		const res = await getStatus(jobId)
		expect(res.status).toBe(200)

		const body = (await res.json()) as {
			isJobCompleted: boolean
			verificationId: string
			contract: {
				match: string
				creationMatch: string
				runtimeMatch: string
				matchId: string
				name: string
				chainId: string
				address: string
				verifiedAt: string
			}
		}

		expect(body.isJobCompleted).toBe(true)
		expect(body.verificationId).toBe(jobId)
		expect(body.contract.matchId).toBe(String(verifiedId))
		expect(body.contract.name).toBe('TestContract')
		expect(body.contract.chainId).toBe('185')
		expect(body.contract.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
		expect(body.contract.runtimeMatch).toBe('exact_match')
		expect(body.contract.match).toBe('exact_match')
		expect(body.contract.verifiedAt).toBeTypeOf('string')
	})

	it('resolves a numeric verificationId to a verified contract', async () => {
		const verifiedId = await seedVerifiedContract()

		const res = await getStatus(String(verifiedId))
		expect(res.status).toBe(200)

		const body = (await res.json()) as {
			isJobCompleted: boolean
			contract: { matchId: string; name: string }
		}

		expect(body.isJobCompleted).toBe(true)
		expect(body.contract.matchId).toBe(String(verifiedId))
		expect(body.contract.name).toBe('TestContract')
	})
})
