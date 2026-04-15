import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:test'
import { Hex } from 'ox'
import { describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import { runVerificationJob } from '#route.verify.ts'
import { vyperFixture } from '../fixtures/vyper.fixture.ts'

const JOB_DEFAULTS = {
	chainId: vyperFixture.chainId,
	address: vyperFixture.address,
	stdJsonInput: vyperFixture.stdJsonInput,
	compilerVersion: vyperFixture.compilerVersion,
	contractIdentifier: vyperFixture.contractIdentifier,
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

/**
 * Container stub that responds to /compile/vyper (the Vyper compile endpoint).
 */
function makeVyperContainerStub(
	overrideOutput?: unknown,
	overrideStatus?: number,
) {
	return {
		getContainer: () => ({
			fetch: async (request: Request) => {
				const url = new URL(request.url)
				if (request.method === 'POST' && url.pathname === '/compile/vyper') {
					return Response.json(
						overrideOutput ?? vyperFixture.vyperCompileOutput,
						{ status: overrideStatus ?? 200 },
					)
				}
				throw new Error(
					`Unexpected container request: ${request.method} ${url.pathname}`,
				)
			},
		}),
	}
}

function makeClientStub(
	onchainBytecode: `0x${string}` = vyperFixture.onchainRuntimeBytecode,
) {
	return {
		createPublicClient: () => ({
			getCode: async () => onchainBytecode,
		}),
	}
}

// ──────────────────────────────────────────────────────────────────────
// Happy path
// ──────────────────────────────────────────────────────────────────────

describe('runVerificationJob – Vyper happy path', () => {
	it('successfully verifies a Vyper contract via /compile/vyper', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{ ...makeClientStub(), ...makeVyperContainerStub() },
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBeNull()
		expect(job?.verifiedContractId).not.toBeNull()

		// Verify the compiled_contracts row uses 'vyper' compiler
		const db = drizzle(env.CONTRACTS_DB)
		const compilations = await db
			.select()
			.from(DB.compiledContractsTable)
			.limit(1)
		expect(compilations).toHaveLength(1)
		const comp = compilations[0]
		if (!comp) throw new Error('expected compiled_contracts row')
		expect(comp.compiler).toBe('vyper')
		expect(comp.language).toBe('Vyper')
		expect(comp.name).toBe('vyper_contract')
		expect(comp.fullyQualifiedName).toBe(vyperFixture.contractIdentifier)

		// Verify sources were persisted
		const sources = await db
			.select()
			.from(DB.compiledContractsSourcesTable)
			.limit(10)
		expect(sources.length).toBeGreaterThanOrEqual(1)
	})

	it('persists Vyper ABI signatures correctly', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{ ...makeClientStub(), ...makeVyperContainerStub() },
		)

		const db = drizzle(env.CONTRACTS_DB)
		const sigLinks = await db
			.select()
			.from(DB.compiledContractsSignaturesTable)
			.limit(50)

		// The fixture ABI has: owner, value, set_value, get_value (functions) + ValueChanged (event)
		// constructor is excluded from signatures
		const functionSigs = sigLinks.filter((s) => s.signatureType === 'function')
		const eventSigs = sigLinks.filter((s) => s.signatureType === 'event')

		expect(functionSigs.length).toBe(4) // owner, value, set_value, get_value
		expect(eventSigs.length).toBe(1) // ValueChanged
	})
})

// ──────────────────────────────────────────────────────────────────────
// Failure paths
// ──────────────────────────────────────────────────────────────────────

describe('runVerificationJob – Vyper compilation failure', () => {
	it('records compilation_failed when /compile/vyper returns non-200', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				...makeClientStub(),
				...makeVyperContainerStub({ error: 'Vyper compiler not found' }, 500),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBe('compilation_failed')
	})

	it('records compilation_error when Vyper output contains errors', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		const outputWithErrors = {
			...vyperFixture.vyperCompileOutput,
			errors: [
				{
					severity: 'error',
					message: 'SyntaxError: invalid syntax',
					formattedMessage: 'SyntaxError: invalid syntax at line 5',
				},
			],
		}

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{ ...makeClientStub(), ...makeVyperContainerStub(outputWithErrors) },
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBe('compilation_error')
		const errorData = JSON.parse(job?.errorData ?? '{}') as {
			message?: string
		}
		expect(errorData.message).toContain('SyntaxError')
	})
})

describe('runVerificationJob – Vyper bytecode mismatch', () => {
	it('records no_match when on-chain bytecode differs from compiled Vyper output', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				...makeClientStub(vyperFixture.mismatchedOnchainBytecode),
				...makeVyperContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBe('no_match')
		const errorData = JSON.parse(job?.errorData ?? '{}') as {
			message?: string
		}
		expect(errorData.message).toBeTruthy()
	})
})

describe('runVerificationJob – Vyper contract not found in output', () => {
	it('records contract_not_found_in_output when contract name is absent', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		// Compile output with a different contract name
		const wrongNameOutput = {
			contracts: {
				'vyper_contract.vy': {
					wrong_name:
						vyperFixture.vyperCompileOutput.contracts['vyper_contract.vy']
							?.vyper_contract,
				},
			},
			sources: vyperFixture.vyperCompileOutput.sources,
		}

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{ ...makeClientStub(), ...makeVyperContainerStub(wrongNameOutput) },
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBe('contract_not_found_in_output')
	})
})
