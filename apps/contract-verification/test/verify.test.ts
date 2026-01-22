import { Hex } from 'ox'
import { env } from 'cloudflare:test'
import { eq, and } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { beforeEach, describe, expect, it } from 'vitest'

import {
	verificationJobsTable,
	verifiedContractsTable,
	contractDeploymentsTable,
} from '#database/schema.ts'

const TEST_ADDRESS = '0x1234567890123456789012345678901234567890'
const TEST_CHAIN_ID = 911867

describe('verification_jobs table operations', () => {
	beforeEach(async () => {
		const db = drizzle(env.CONTRACTS_DB)
		await db.delete(verificationJobsTable)
		await db.delete(verifiedContractsTable)
		await db.delete(contractDeploymentsTable)
	})

	it('creates a verification job with pending status', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const jobId = crypto.randomUUID()
		const addressBytes = Hex.toBytes(TEST_ADDRESS)

		await db.insert(verificationJobsTable).values({
			id: jobId,
			chainId: TEST_CHAIN_ID,
			contractAddress: addressBytes,
			verificationEndpoint: '/v2/verify',
		})

		const jobs = await db
			.select()
			.from(verificationJobsTable)
			.where(eq(verificationJobsTable.id, jobId))

		expect(jobs).toHaveLength(1)
		expect(jobs[0]?.chainId).toBe(TEST_CHAIN_ID)
		expect(jobs[0]?.verificationEndpoint).toBe('/v2/verify')
		expect(jobs[0]?.completedAt).toBeNull()
		expect(jobs[0]?.errorCode).toBeNull()
		expect(jobs[0]?.verifiedContractId).toBeNull()
	})

	it('updates job to completed with error', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const jobId = crypto.randomUUID()
		const addressBytes = Hex.toBytes(TEST_ADDRESS)

		await db.insert(verificationJobsTable).values({
			id: jobId,
			chainId: TEST_CHAIN_ID,
			contractAddress: addressBytes,
			verificationEndpoint: '/v2/verify',
		})

		const completedAt = new Date().toISOString()
		await db
			.update(verificationJobsTable)
			.set({
				completedAt,
				errorCode: 'compilation_failed',
				errorData: JSON.stringify({ message: 'solc crashed' }),
				compilationTime: 1500,
			})
			.where(eq(verificationJobsTable.id, jobId))

		const jobs = await db
			.select()
			.from(verificationJobsTable)
			.where(eq(verificationJobsTable.id, jobId))

		expect(jobs).toHaveLength(1)
		expect(jobs[0]?.completedAt).toBe(completedAt)
		expect(jobs[0]?.errorCode).toBe('compilation_failed')
		expect(jobs[0]?.compilationTime).toBe(1500)
	})

	it('updates job to completed with success (without verified contract id)', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const jobId = crypto.randomUUID()
		const addressBytes = Hex.toBytes(TEST_ADDRESS)

		await db.insert(verificationJobsTable).values({
			id: jobId,
			chainId: TEST_CHAIN_ID,
			contractAddress: addressBytes,
			verificationEndpoint: '/v2/verify',
		})

		const completedAt = new Date().toISOString()
		await db
			.update(verificationJobsTable)
			.set({
				completedAt,
				compilationTime: 2000,
			})
			.where(eq(verificationJobsTable.id, jobId))

		const jobs = await db
			.select()
			.from(verificationJobsTable)
			.where(eq(verificationJobsTable.id, jobId))

		expect(jobs).toHaveLength(1)
		expect(jobs[0]?.completedAt).toBe(completedAt)
		expect(jobs[0]?.compilationTime).toBe(2000)
		expect(jobs[0]?.errorCode).toBeNull()
	})

	it('queries pending jobs by chain and address', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const jobId = crypto.randomUUID()
		const addressBytes = Hex.toBytes(TEST_ADDRESS)

		// Create pending job
		await db.insert(verificationJobsTable).values({
			id: jobId,
			chainId: TEST_CHAIN_ID,
			contractAddress: addressBytes,
			verificationEndpoint: '/v2/verify',
		})

		// Query for pending jobs (completedAt is null)
		const pendingJobs = await db
			.select({ id: verificationJobsTable.id })
			.from(verificationJobsTable)
			.where(
				and(
					eq(verificationJobsTable.chainId, TEST_CHAIN_ID),
					eq(verificationJobsTable.contractAddress, addressBytes),
				),
			)

		expect(pendingJobs).toHaveLength(1)
		expect(pendingJobs[0]?.id).toBe(jobId)
	})
})

describe('job status transitions', () => {
	beforeEach(async () => {
		const db = drizzle(env.CONTRACTS_DB)
		await db.delete(verificationJobsTable)
	})

	it('job transitions from pending to failed', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const jobId = crypto.randomUUID()
		const addressBytes = Hex.toBytes(TEST_ADDRESS)

		// Create pending job
		await db.insert(verificationJobsTable).values({
			id: jobId,
			chainId: TEST_CHAIN_ID,
			contractAddress: addressBytes,
			verificationEndpoint: '/v2/verify',
		})

		// Verify initially pending
		let job = await db
			.select()
			.from(verificationJobsTable)
			.where(eq(verificationJobsTable.id, jobId))
			.then((r) => r[0])

		expect(job?.completedAt).toBeNull()

		// Mark as failed
		await db
			.update(verificationJobsTable)
			.set({
				completedAt: new Date().toISOString(),
				errorCode: 'no_match',
				errorData: JSON.stringify({ message: 'Bytecode mismatch' }),
			})
			.where(eq(verificationJobsTable.id, jobId))

		// Verify completed with error
		job = await db
			.select()
			.from(verificationJobsTable)
			.where(eq(verificationJobsTable.id, jobId))
			.then((r) => r[0])

		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBe('no_match')
	})

	it('multiple jobs for same address are independent', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const addressBytes = Hex.toBytes(TEST_ADDRESS)

		const job1Id = crypto.randomUUID()
		const job2Id = crypto.randomUUID()

		// Create two jobs
		await db.insert(verificationJobsTable).values([
			{
				id: job1Id,
				chainId: TEST_CHAIN_ID,
				contractAddress: addressBytes,
				verificationEndpoint: '/v2/verify',
			},
			{
				id: job2Id,
				chainId: TEST_CHAIN_ID,
				contractAddress: addressBytes,
				verificationEndpoint: '/v2/verify',
			},
		])

		// Complete first job with error
		await db
			.update(verificationJobsTable)
			.set({
				completedAt: new Date().toISOString(),
				errorCode: 'compilation_failed',
			})
			.where(eq(verificationJobsTable.id, job1Id))

		// Verify second job is still pending
		const job2 = await db
			.select()
			.from(verificationJobsTable)
			.where(eq(verificationJobsTable.id, job2Id))
			.then((r) => r[0])

		expect(job2?.completedAt).toBeNull()
		expect(job2?.errorCode).toBeNull()
	})
})

describe('error data handling', () => {
	beforeEach(async () => {
		const db = drizzle(env.CONTRACTS_DB)
		await db.delete(verificationJobsTable)
	})

	it('stores and retrieves complex error data', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const jobId = crypto.randomUUID()
		const addressBytes = Hex.toBytes(TEST_ADDRESS)

		const testErrorData = {
			message: 'Compilation failed',
			details: {
				errors: [
					{ line: 10, message: 'Syntax error' },
					{ line: 25, message: 'Type mismatch' },
				],
			},
		}

		await db.insert(verificationJobsTable).values({
			id: jobId,
			chainId: TEST_CHAIN_ID,
			contractAddress: addressBytes,
			verificationEndpoint: '/v2/verify',
			completedAt: new Date().toISOString(),
			errorCode: 'compilation_error',
			errorData: JSON.stringify(testErrorData),
		})

		const job = await db
			.select()
			.from(verificationJobsTable)
			.where(eq(verificationJobsTable.id, jobId))
			.then((r) => r[0])

		expect(job).toBeDefined()
		expect(job?.errorData).toBeDefined()
		const storedErrorData = job?.errorData ?? ''
		const parsed = JSON.parse(storedErrorData) as {
			message: string
			details: { errors: unknown[] }
		}
		expect(parsed.message).toBe('Compilation failed')
		expect(parsed.details.errors).toHaveLength(2)
	})
})
