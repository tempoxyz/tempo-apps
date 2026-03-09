import * as z from 'zod/mini'
import { env, SELF } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import { runVerificationJob } from '#route.verify.ts'
import { counterFixture } from '../fixtures/counter.fixture.ts'

const VerificationIdSchema = z.object({ verificationId: z.string() })
const VerificationStatusSchema = z.object({
	isJobCompleted: z.boolean(),
	error: z.optional(
		z.object({
			customCode: z.string(),
			message: z.string(),
		}),
	),
})
const ErrorResponseSchema = z.object({ customCode: z.string() })
const verifyRequestBody = {
	stdJsonInput: counterFixture.stdJsonInput,
	compilerVersion: counterFixture.compilerVersion,
	contractIdentifier: counterFixture.contractIdentifier,
} as const

const getFirst = <T>(items: T[], label: string) => {
	const value = items.at(0)
	if (!value) throw new Error(`Expected ${label} to have at least one item`)
	return value
}

describe('full verification flow', () => {
	async function createVerificationJob(): Promise<string> {
		const verifyResponse = await SELF.fetch(
			`https://test.local/v2/verify/${counterFixture.chainId}/${counterFixture.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(verifyRequestBody),
			},
		)

		if (verifyResponse.status !== 202) {
			console.error('Verify failed:', await verifyResponse.clone().text())
		}
		expect(verifyResponse.status).toBe(202)

		const verificationIdJson = await verifyResponse.json()
		return z.parse(VerificationIdSchema, verificationIdJson).verificationId
	}

	async function runSuccessfulVerification(): Promise<string> {
		const verificationId = await createVerificationJob()

		await runVerificationJob(
			env,
			verificationId,
			counterFixture.chainId,
			counterFixture.address,
			verifyRequestBody,
			{
				createPublicClient: () => ({
					getCode: async () => counterFixture.onchainRuntimeBytecode,
				}),
				getContainer: () => ({
					fetch: async (request) => {
						const url = new URL(request.url)
						if (request.method === 'POST' && url.pathname === '/compile') {
							return Response.json(counterFixture.solcOutput, { status: 200 })
						}

						throw new Error(
							`Unexpected container request: ${request.method} ${request.url}`,
						)
					},
				}),
			},
		)

		const statusResponse = await SELF.fetch(
			`https://test.local/v2/verify/${verificationId}`,
		)
		expect(statusResponse.status).toBe(200)

		const status = z.parse(
			VerificationStatusSchema,
			await statusResponse.json(),
		)
		expect(status.isJobCompleted).toBe(true)
		expect(status.error).toBeUndefined()

		return verificationId
	}

	it('verifies a simple contract and persists to database', async () => {
		const verificationId = await runSuccessfulVerification()

		const statusResponse = await SELF.fetch(
			`https://test.local/v2/verify/${verificationId}`,
		)
		expect(statusResponse.status).toBe(200)
		const status = z.parse(
			VerificationStatusSchema,
			await statusResponse.json(),
		)
		expect(status.error).toBeUndefined()

		const lookupResponse = await SELF.fetch(
			`https://test.local/v2/contract/${counterFixture.chainId}/${counterFixture.address}?fields=sources,signatures`,
		)

		expect(lookupResponse.status).toBe(200)
		const contractSchema = z.object({
			match: z.string(),
			runtimeMatch: z.string(),
			creationMatch: z.string(),
			sources: z.record(z.string(), z.object({ content: z.string() })),
			signatures: z.object({
				function: z.array(
					z.object({ signature: z.string(), signatureHash32: z.string() }),
				),
				event: z.array(
					z.object({ signature: z.string(), signatureHash32: z.string() }),
				),
				error: z.array(
					z.object({ signature: z.string(), signatureHash32: z.string() }),
				),
			}),
		})
		const contract = z.parse(contractSchema, await lookupResponse.json())

		expect(contract.match).toBe('exact_match')
		expect(contract.runtimeMatch).toBe('exact_match')
		expect(contract.sources['Counter.sol']).toBeDefined()
		expect(
			contract.signatures.function.some((s) => s.signature === 'increment()'),
		).toBeTruthy()
		expect(
			contract.signatures.function.some((s) => s.signature === 'decrement()'),
		).toBeTruthy()
		expect(contract.signatures.event.length).toBeGreaterThanOrEqual(0)
	})

	it('persists all related database records correctly', async () => {
		const verificationId = await runSuccessfulVerification()

		const db = drizzle(env.CONTRACTS_DB)

		const codes = await db.select().from(DB.codeTable)
		expect(codes.length).toBeGreaterThanOrEqual(2)

		const contracts = await db.select().from(DB.contractsTable)
		expect(contracts).toHaveLength(1)

		const deployments = await db.select().from(DB.contractDeploymentsTable)
		expect(deployments).toHaveLength(1)
		expect(getFirst(deployments, 'deployments').chainId).toBe(
			counterFixture.chainId,
		)

		const compiled = await db.select().from(DB.compiledContractsTable)
		expect(compiled).toHaveLength(1)
		const compiledContract = getFirst(compiled, 'compiled')
		expect(compiledContract.name).toBe('Counter')
		expect(compiledContract.compiler).toBe('solc')
		expect(compiledContract.version).toBe(counterFixture.compilerVersion)

		const sources = await db.select().from(DB.compiledContractsSourcesTable)
		expect(sources).toHaveLength(1)
		expect(getFirst(sources, 'sources').path).toBe('Counter.sol')

		const signatures = await db
			.select()
			.from(DB.compiledContractsSignaturesTable)
		expect(signatures.length).toBeGreaterThan(0)

		const verified = await db.select().from(DB.verifiedContractsTable)
		expect(verified).toHaveLength(1)
		const verifiedContract = getFirst(verified, 'verified')
		expect(verifiedContract.runtimeMatch).toBeTruthy()
		expect(verifiedContract.creationMatch).toBeFalsy()

		const jobs = await db
			.select()
			.from(DB.verificationJobsTable)
			.where(eq(DB.verificationJobsTable.id, verificationId))
		expect(jobs).toHaveLength(1)
		const job = getFirst(jobs, 'jobs')
		expect(job.completedAt).not.toBeNull()
		expect(job.verifiedContractId).toBe(verifiedContract.id)
	})

	it('returns 409 for already verified contract', async () => {
		await runSuccessfulVerification()

		const secondResponse = await SELF.fetch(
			`https://test.local/v2/verify/${counterFixture.chainId}/${counterFixture.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(verifyRequestBody),
			},
		)

		expect(secondResponse.status).toBe(409)
		const bodyJson = await secondResponse.json()
		expect(z.parse(ErrorResponseSchema, bodyJson).customCode).toBe(
			'already_verified',
		)
	})
})
