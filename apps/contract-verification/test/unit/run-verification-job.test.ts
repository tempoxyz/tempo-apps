import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:test'
import { Hex } from 'ox'
import { describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import { ChainRegistry } from '#lib/chain-registry.ts'
import { runVerificationJob as runVerificationJobWithRegistry } from '#route.verify.ts'
import { staticChains } from '#wagmi.config.ts'

// Tests exercise the job directly against the static chain registry.
const runVerificationJob = (
	jobEnv: Parameters<typeof runVerificationJobWithRegistry>[0],
	job: Parameters<typeof runVerificationJobWithRegistry>[1],
	deps?: Parameters<typeof runVerificationJobWithRegistry>[3],
) =>
	runVerificationJobWithRegistry(
		jobEnv,
		job,
		ChainRegistry.fromStatic(staticChains),
		deps,
	)
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

function makeContainerStub(output: unknown = counterFixture.solcOutput) {
	return {
		getContainer: () => ({
			fetch: async (request: Request) => {
				const url = new URL(request.url)
				if (request.method === 'POST' && url.pathname === '/compile') {
					return Response.json(output, { status: 200 })
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
						status: 'success' as const,
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

describe('runVerificationJob – creation bytecode matching', () => {
	const txHash =
		'0x00000000000000000000000000000000000000000000000000000000000000c1' as const
	const initcode = `0x${counterFixture.solcOutput.contracts['Counter.sol'].Counter.evm.bytecode.object}`
	const constructorArguments = `${'00'.repeat(31)}05`

	async function verifyWithCreationInput(
		input: string,
		jobFields: Partial<Parameters<typeof runVerificationJob>[1]> = {
			creationTransactionHash: txHash,
		},
		compileOutput: unknown = counterFixture.solcOutput,
	) {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)
		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId, ...jobFields },
			{
				createPublicClient: () => ({
					getCode: async () => counterFixture.onchainRuntimeBytecode,
					getTransactionReceipt: async () => ({
						status: 'success' as const,
						transactionHash: txHash,
						blockNumber: 42n,
						transactionIndex: 0,
						from: '0x00000000000000000000000000000000000000aa' as const,
						contractAddress: counterFixture.address,
					}),
					getTransaction: async () => ({ input: input as Hex.Hex, to: null }),
				}),
				...makeContainerStub(compileOutput),
			},
		)
		const job = await getJobRow(jobId)
		expect(job?.errorCode).toBeNull()
		const db = drizzle(env.CONTRACTS_DB)
		const [verified] = await db
			.select()
			.from(DB.verifiedContractsTable)
			.where(eq(DB.verifiedContractsTable.id, job?.verifiedContractId ?? -1))
		if (!verified) throw new Error('expected verified contract row')
		return verified
	}

	it('records an exact creation match with its constructor arguments', async () => {
		const verified = await verifyWithCreationInput(
			`${initcode}${constructorArguments}`,
		)
		expect(verified.creationMatch).toBe(true)
		expect(verified.creationMetadataMatch).toBe(true)
		expect(JSON.parse(verified.creationValues ?? '{}')).toEqual({
			constructorArguments: `0x${constructorArguments}`,
		})
	})

	it.each([
		{ name: 'omits the hash', resubmission: {} },
		{
			name: 'submits an unrelated hash',
			resubmission: { creationTransactionHash: `0x${'ee'.repeat(32)}` },
		},
	])('re-proves the creation from the recorded transaction when a resubmission $name', async ({
		resubmission,
	}) => {
		const input = `${initcode}${constructorArguments}`
		// Different metadata hash: runtime and creation match only partially.
		const partialOutput = structuredClone(counterFixture.solcOutput) as {
			contracts: Record<
				string,
				Record<string, { evm: Record<string, { object: string }> }>
			>
		}
		const counter = partialOutput.contracts['Counter.sol']?.Counter?.evm
		if (!counter) throw new Error('expected Counter output')
		// Flip the first byte of the IPFS metadata digest, keeping the auxdata well formed.
		for (const code of [counter.bytecode, counter.deployedBytecode])
			if (code)
				code.object = code.object.replace(
					/(6970667358221220)([0-9a-f]{2})/,
					(_, marker: string, byte: string) =>
						`${marker}${(Number.parseInt(byte, 16) ^ 0xff).toString(16).padStart(2, '0')}`,
				)
		const first = await verifyWithCreationInput(
			input,
			{ creationTransactionHash: txHash },
			partialOutput,
		)
		expect(first.runtimeMetadataMatch).toBe(false)
		expect(first.creationMatch).toBe(true)
		expect(first.creationMetadataMatch).toBe(false)

		// The exact sources, without the right creation hash: the recorded transaction re-proves it.
		const exact = await verifyWithCreationInput(input, resubmission)
		expect(exact.id).toBe(first.id)
		expect(exact.runtimeMetadataMatch).toBe(true)
		expect(exact.creationMatch).toBe(true)
		expect(exact.creationMetadataMatch).toBe(true)
	})

	it('records no creation match when the creation input carries unexplained bytes', async () => {
		const verified = await verifyWithCreationInput(
			`${initcode}${constructorArguments}ff`,
		)
		expect(verified.runtimeMatch).toBe(true)
		expect(verified.creationMatch).toBe(false)
		expect(verified.creationMetadataMatch).toBeNull()
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
						status: 'success' as const,
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
