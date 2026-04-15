import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:workers'
import { Hex } from 'ox'
import { describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import { runVerificationJob } from '#route.verify.ts'
import { counterFixture } from '../fixtures/counter.fixture.ts'

const JOB_DEFAULTS = {
	chainId: counterFixture.chainId,
	address: counterFixture.address,
	stdJsonInput: counterFixture.stdJsonInput,
	compilerVersion: counterFixture.compilerVersion,
	contractIdentifier: counterFixture.contractIdentifier,
} as const

async function insertJobRow(jobId: string) {
	const db = drizzle(env.CONTRACTS_DB)
	await db.insert(DB.verificationJobsTable).values({
		id: jobId,
		chainId: JOB_DEFAULTS.chainId,
		contractAddress: Hex.toBytes(JOB_DEFAULTS.address),
		verificationEndpoint: '/v2/verify',
	})
}

async function getJobRow(jobId: string) {
	const db = drizzle(env.CONTRACTS_DB)
	const rows = await db
		.select()
		.from(DB.verificationJobsTable)
		.where(eq(DB.verificationJobsTable.id, jobId))
		.limit(1)
	return rows.at(0) ?? null
}

function makeContainerStub() {
	return {
		getContainer: () => ({
			fetch: async (request: Request) => {
				const url = new URL(request.url)
				if (request.method === 'POST' && url.pathname === '/compile') {
					return Response.json(counterFixture.solcOutput, { status: 200 })
				}
				throw new Error(
					`Unexpected container request: ${request.method} ${url.pathname}`,
				)
			},
		}),
	}
}

describe('runVerificationJob – creation tx metadata success', () => {
	it('persists deployer/block/txIndex from a valid creation transaction receipt', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		const fakeTxHash =
			'0x0000000000000000000000000000000000000000000000000000000000000001' as const
		const fakeDeployer = '0x00000000000000000000000000000000000000aa' as const

		await runVerificationJob(
			env,
			{
				...JOB_DEFAULTS,
				jobId,
				creationTransactionHash: fakeTxHash,
			},
			{
				createPublicClient: () => ({
					getCode: async () => counterFixture.onchainRuntimeBytecode,
					getTransactionReceipt: async () => ({
						transactionHash: fakeTxHash,
						blockNumber: 42n,
						transactionIndex: 7,
						from: fakeDeployer,
						contractAddress: counterFixture.address,
					}),
				}),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBeNull()

		const db = drizzle(env.CONTRACTS_DB)
		const deployments = await db
			.select()
			.from(DB.contractDeploymentsTable)
			.where(
				and(
					eq(DB.contractDeploymentsTable.chainId, JOB_DEFAULTS.chainId),
					eq(
						DB.contractDeploymentsTable.address,
						Hex.toBytes(JOB_DEFAULTS.address),
					),
				),
			)
			.limit(1)

		expect(deployments).toHaveLength(1)
		const dep = deployments[0]
		if (!dep) throw new Error('expected deployment row')
		expect(dep.blockNumber).toBe(42)
		expect(dep.transactionIndex).toBe(7)
		expect(dep.deployer).not.toBeNull()
		expect(dep.transactionHash).not.toBeNull()
	})
})

describe('runVerificationJob – creation tx metadata failure', () => {
	it('still verifies when getTransactionReceipt throws', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		const fakeTxHash =
			'0x0000000000000000000000000000000000000000000000000000000000000002' as const

		await runVerificationJob(
			env,
			{
				...JOB_DEFAULTS,
				jobId,
				creationTransactionHash: fakeTxHash,
			},
			{
				createPublicClient: () => ({
					getCode: async () => counterFixture.onchainRuntimeBytecode,
					getTransactionReceipt: async () => {
						throw new Error('RPC receipt error')
					},
				}),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBeNull()

		const db = drizzle(env.CONTRACTS_DB)
		const deployments = await db
			.select()
			.from(DB.contractDeploymentsTable)
			.where(
				and(
					eq(DB.contractDeploymentsTable.chainId, JOB_DEFAULTS.chainId),
					eq(
						DB.contractDeploymentsTable.address,
						Hex.toBytes(JOB_DEFAULTS.address),
					),
				),
			)
			.limit(1)

		expect(deployments).toHaveLength(1)
		expect(deployments[0]?.transactionHash).toBeNull()
		expect(deployments[0]?.deployer).toBeNull()
	})

	it('still verifies when receipt contractAddress does not match', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		const fakeTxHash =
			'0x0000000000000000000000000000000000000000000000000000000000000003' as const

		await runVerificationJob(
			env,
			{
				...JOB_DEFAULTS,
				jobId,
				creationTransactionHash: fakeTxHash,
			},
			{
				createPublicClient: () => ({
					getCode: async () => counterFixture.onchainRuntimeBytecode,
					getTransactionReceipt: async () => ({
						transactionHash: fakeTxHash,
						blockNumber: 10n,
						transactionIndex: 0,
						from: '0x00000000000000000000000000000000000000bb' as const,
						contractAddress:
							'0x0000000000000000000000000000000000099999' as const,
					}),
				}),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.errorCode).toBeNull()

		const db = drizzle(env.CONTRACTS_DB)
		const deployments = await db
			.select()
			.from(DB.contractDeploymentsTable)
			.where(
				and(
					eq(DB.contractDeploymentsTable.chainId, JOB_DEFAULTS.chainId),
					eq(
						DB.contractDeploymentsTable.address,
						Hex.toBytes(JOB_DEFAULTS.address),
					),
				),
			)
			.limit(1)

		expect(deployments).toHaveLength(1)
		expect(deployments[0]?.transactionHash).toBeNull()
	})
})

describe('runVerificationJob – getCode returns empty', () => {
	it('records contract_not_found when getCode returns undefined', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				createPublicClient: () => ({
					getCode: async () => undefined as unknown as `0x${string}`,
				}),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBe('contract_not_found')
		const errorData = JSON.parse(job?.errorData ?? '{}') as { message?: string }
		expect(errorData.message).toContain('No bytecode found')
	})

	it('records contract_not_found when getCode returns 0x', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				createPublicClient: () => ({
					getCode: async () => '0x' as `0x${string}`,
				}),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.errorCode).toBe('contract_not_found')
	})
})

describe('runVerificationJob – getCode throws', () => {
	it('records internal_error when getCode rejects', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				createPublicClient: () => ({
					getCode: async () => {
						throw new Error('RPC transport failure')
					},
				}),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBe('internal_error')
		const errorData = JSON.parse(job?.errorData ?? '{}') as { message?: string }
		expect(errorData.message).toContain('RPC transport failure')
	})

	it('records internal_error when getCode returns non-Error rejection', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				createPublicClient: () => ({
					getCode: async () => {
						throw 'string rejection'
					},
				}),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.errorCode).toBe('internal_error')
	})
})
