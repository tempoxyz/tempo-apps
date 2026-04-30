import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import { runVerificationJob } from '#route.verify.ts'
import { counterFixture } from '../fixtures/counter.fixture.ts'

const verifyRequestData = {
	stdJsonInput: counterFixture.stdJsonInput,
	compilerVersion: counterFixture.compilerVersion,
	contractIdentifier: counterFixture.contractIdentifier,
} as const

async function createJob(): Promise<string> {
	const res = await SELF.fetch(
		`https://test.local/v2/verify/${counterFixture.chainId}/${counterFixture.address}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(verifyRequestData),
		},
	)
	expect(res.status).toBe(202)
	const body = (await res.json()) as { verificationId: string }
	return body.verificationId
}

async function getJob(jobId: string) {
	const db = drizzle(env.CONTRACTS_DB)
	const rows = await db
		.select()
		.from(DB.verificationJobsTable)
		.where(eq(DB.verificationJobsTable.id, jobId))
	expect(rows).toHaveLength(1)
	const job = rows[0]
	if (!job) throw new Error('expected verification job row')
	return job
}

const validClientDeps = {
	createPublicClient: () => ({
		getCode: async () => counterFixture.onchainRuntimeBytecode,
	}),
} as const

describe('runVerificationJob failure branches', () => {
	it('records internal_error for unsupported chain id', async () => {
		const jobId = await createJob()

		await runVerificationJob(env, {
			jobId,
			chainId: 999_999 as never,
			address: counterFixture.address,
			stdJsonInput: counterFixture.stdJsonInput,
			compilerVersion: counterFixture.compilerVersion,
			contractIdentifier: counterFixture.contractIdentifier,
		})

		const job = await getJob(jobId)
		expect(job.completedAt).not.toBeNull()
		expect(job.errorCode).toBe('internal_error')
		const data = JSON.parse(job.errorData ?? '{}') as { message?: string }
		expect(data.message).toMatch(/not supported/i)
	})

	it('records compilation_failed when container returns non-200', async () => {
		const jobId = await createJob()

		await runVerificationJob(
			env,
			{
				jobId,
				...counterFixture,
			},
			{
				...validClientDeps,
				getContainer: () => ({
					fetch: async () =>
						new Response('solc exited with code 1', { status: 500 }),
				}),
			},
		)

		const job = await getJob(jobId)
		expect(job.completedAt).not.toBeNull()
		expect(job.errorCode).toBe('compilation_failed')
		const data = JSON.parse(job.errorData ?? '{}') as { message?: string }
		expect(data.message).toContain('solc exited with code 1')
	})

	it('records contract_not_found_in_output when target contract is absent', async () => {
		const jobId = await createJob()

		const modifiedOutput = structuredClone(counterFixture.solcOutput) as {
			contracts: Record<string, Record<string, unknown>>
		}
		modifiedOutput.contracts = {
			'Counter.sol': {
				OtherContract:
					counterFixture.solcOutput.contracts['Counter.sol'].Counter,
			},
		}

		await runVerificationJob(
			env,
			{
				jobId,
				...counterFixture,
			},
			{
				...validClientDeps,
				getContainer: () => ({
					fetch: async () => Response.json(modifiedOutput, { status: 200 }),
				}),
			},
		)

		const job = await getJob(jobId)
		expect(job.completedAt).not.toBeNull()
		expect(job.errorCode).toBe('contract_not_found_in_output')
		const data = JSON.parse(job.errorData ?? '{}') as { message?: string }
		expect(data.message).toContain('Counter')
	})

	it('records no_match when compiled bytecode differs from on-chain', async () => {
		const jobId = await createJob()

		await runVerificationJob(
			env,
			{
				jobId,
				...counterFixture,
			},
			{
				createPublicClient: () => ({
					getCode: async () =>
						'0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as `0x${string}`,
				}),
				getContainer: () => ({
					fetch: async () =>
						Response.json(counterFixture.solcOutput, { status: 200 }),
				}),
			},
		)

		const job = await getJob(jobId)
		expect(job.completedAt).not.toBeNull()
		expect(job.errorCode).toBe('no_match')
		const data = JSON.parse(job.errorData ?? '{}') as { message?: string }
		expect(data.message).toMatch(/bytecode|match/i)
	})

	it('persists internal_error with errorId when an unexpected error is thrown', async () => {
		const jobId = await createJob()

		await runVerificationJob(
			env,
			{
				jobId,
				...counterFixture,
			},
			{
				createPublicClient: () => ({
					getCode: async () => {
						throw new Error('RPC node unreachable')
					},
				}),
			},
		)

		const job = await getJob(jobId)
		expect(job.completedAt).not.toBeNull()
		expect(job.errorCode).toBe('internal_error')
		expect(job.errorId).toBeTruthy()
		const data = JSON.parse(job.errorData ?? '{}') as { message?: string }
		expect(data.message).toContain('RPC node unreachable')
		expect(job.compilationTime).toBeTypeOf('number')
	})

	it('records contract_not_found_in_output for empty compile output', async () => {
		const jobId = await createJob()

		await runVerificationJob(
			env,
			{
				jobId,
				...counterFixture,
			},
			{
				...validClientDeps,
				getContainer: () => ({
					fetch: async () => Response.json({}, { status: 200 }),
				}),
			},
		)

		const job = await getJob(jobId)
		expect(job.completedAt).not.toBeNull()
		expect(job.errorCode).toBe('contract_not_found_in_output')
	})

	it('records internal_error when compile output is not valid JSON', async () => {
		const jobId = await createJob()

		await runVerificationJob(
			env,
			{
				jobId,
				...counterFixture,
			},
			{
				...validClientDeps,
				getContainer: () => ({
					fetch: async () =>
						new Response('not json at all', {
							status: 200,
							headers: { 'Content-Type': 'application/json' },
						}),
				}),
			},
		)

		const job = await getJob(jobId)
		expect(job.completedAt).not.toBeNull()
		expect(job.errorCode).toBe('internal_error')
	})

	it('records container_error when container fetch throws', async () => {
		const jobId = await createJob()

		await runVerificationJob(
			env,
			{
				jobId,
				...counterFixture,
			},
			{
				...validClientDeps,
				getContainer: () => ({
					fetch: async () => {
						throw new Error('connection refused')
					},
				}),
			},
		)

		const job = await getJob(jobId)
		expect(job.completedAt).not.toBeNull()
		expect(job.errorCode).toBe('container_error')
		const data = JSON.parse(job.errorData ?? '{}') as { message?: string }
		expect(data.message).toContain('connection refused')
	})

	it('records compilation_error when solc output contains severity=error entries', async () => {
		const jobId = await createJob()

		const errorOutput = {
			contracts: {},
			errors: [
				{
					severity: 'error',
					message: 'ParserError: Expected pragma',
					formattedMessage: 'ParserError: Expected pragma, got EOF',
				},
			],
		}

		await runVerificationJob(
			env,
			{
				jobId,
				...counterFixture,
			},
			{
				...validClientDeps,
				getContainer: () => ({
					fetch: async () => Response.json(errorOutput, { status: 200 }),
				}),
			},
		)

		const job = await getJob(jobId)
		expect(job.completedAt).not.toBeNull()
		expect(job.errorCode).toBe('compilation_error')
		const data = JSON.parse(job.errorData ?? '{}') as { message?: string }
		expect(data.message).toContain('Expected pragma')
	})
})
