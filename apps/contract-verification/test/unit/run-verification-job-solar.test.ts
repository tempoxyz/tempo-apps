import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:test'
import { Hex } from 'ox'
import { describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import { ChainRegistry } from '#lib/chain-registry.ts'
import { runVerificationJob as runVerificationJobWithRegistry } from '#route.verify.ts'
import { staticChains } from '#wagmi.config.ts'
import { solarFixture } from '../fixtures/solar.fixture.ts'

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

const JOB_DEFAULTS = {
	chainId: solarFixture.chainId,
	address: solarFixture.address,
	stdJsonInput: solarFixture.stdJsonInput,
	compilerVersion: solarFixture.compilerVersion,
	contractIdentifier: solarFixture.contractIdentifier,
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

/** Container stub for /compile, recording the request bodies it receives. */
function makeContainerStub(response?: Response) {
	const requests: Array<{ compilerVersion: string; input: unknown }> = []
	return {
		requests,
		getContainer: () => ({
			fetch: async (request: Request) => {
				const url = new URL(request.url)
				if (request.method !== 'POST' || url.pathname !== '/compile')
					throw new Error(
						`Unexpected container request: ${request.method} ${url.pathname}`,
					)
				requests.push(await request.json())
				return response ?? Response.json(solarFixture.solarCompileOutput)
			},
		}),
	}
}

const clientStub = {
	createPublicClient: () => ({
		getCode: async () => solarFixture.onchainRuntimeBytecode,
	}),
}

describe('runVerificationJob – solar', () => {
	it('verifies solar output as an exact match and records the solar compiler', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)
		const container = makeContainerStub()

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{ ...clientStub, getContainer: container.getContainer },
		)

		// The solar version reaches the container unchanged, which picks the pinned build from it.
		expect(container.requests).toHaveLength(1)
		expect(container.requests[0]?.compilerVersion).toBe(
			'0.8.36+commit.d83529b.solar.0.2.0',
		)

		const job = await getJobRow(jobId)
		expect(job?.errorCode).toBeNull()
		expect(job?.verifiedContractId).not.toBeNull()

		const db = drizzle(env.CONTRACTS_DB)
		const [compilation] = await db
			.select()
			.from(DB.compiledContractsTable)
			.limit(1)
		expect(compilation?.compiler).toBe('solar')
		expect(compilation?.version).toBe('0.8.36+commit.d83529b.solar.0.2.0')
		expect(compilation?.fullyQualifiedName).toBe(
			'src/WithImmutables.sol:WithImmutables',
		)

		const [verified] = await db
			.select()
			.from(DB.verifiedContractsTable)
			.where(eq(DB.verifiedContractsTable.id, job?.verifiedContractId ?? -1))
		expect(verified?.runtimeMatch).toBe(true)
		expect(verified?.runtimeMetadataMatch).toBe(true)

		// solar's metadata lists its sources, so the submitted source is kept.
		const sources = await db
			.select()
			.from(DB.compiledContractsSourcesTable)
			.where(
				eq(
					DB.compiledContractsSourcesTable.compilationId,
					compilation?.id ?? '',
				),
			)
		expect(sources.map((source) => source.path)).toEqual([
			'src/WithImmutables.sol',
		])
	})

	it('asks for the solar build when solar bytecode is submitted with a solc version', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)
		const container = makeContainerStub()

		// What Forge sends for a solar build without --compiler-version: the real solc 0.8.36.
		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId, compilerVersion: '0.8.36+commit.8a079791' },
			{ ...clientStub, getContainer: container.getContainer },
		)

		expect(container.requests).toHaveLength(0)
		const job = await getJobRow(jobId)
		expect(job?.errorCode).toBe('solar_compiler_version_required')
		expect(job?.errorData).toContain('compiled by solar 0.2.0')
	})

	it('records compilation_failed when the container has no build for the solar commit', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)
		const container = makeContainerStub(
			Response.json(
				{
					error:
						'Unsupported solar build 0123456 (0.2.0); supported builds: d83529b (0.2.0)',
				},
				{ status: 400 },
			),
		)

		await runVerificationJob(
			env,
			{
				...JOB_DEFAULTS,
				jobId,
				compilerVersion: '0.8.36+commit.0123456.solar.0.2.0',
			},
			{ ...clientStub, getContainer: container.getContainer },
		)

		const job = await getJobRow(jobId)
		expect(job?.errorCode).toBe('compilation_failed')
		expect(job?.errorData).toContain('Unsupported solar build 0123456')
	})
})
