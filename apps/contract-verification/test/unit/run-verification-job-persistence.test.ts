import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:test'
import { Hex } from 'ox'
import { describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import { runVerificationJob } from '#route.verify.ts'
import { counterFixture, counterSource } from '../fixtures/counter.fixture.ts'

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

function makeContainerStub(solcOutput?: unknown) {
	return {
		getContainer: () => ({
			fetch: async (request: Request) => {
				const url = new URL(request.url)
				if (request.method === 'POST' && url.pathname === '/compile') {
					return Response.json(solcOutput ?? counterFixture.solcOutput, {
						status: 200,
					})
				}
				throw new Error(
					`Unexpected container request: ${request.method} ${url.pathname}`,
				)
			},
		}),
	}
}

function makeClientStub() {
	return {
		createPublicClient: () => ({
			getCode: async () => counterFixture.onchainRuntimeBytecode,
		}),
	}
}

// ---------------------------------------------------------------------------
// 1. Suffix-path contract lookup fallback
// ---------------------------------------------------------------------------
describe('runVerificationJob – suffix-path contract lookup fallback', () => {
	it('finds the contract when the compiler output uses a prefixed path', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		// Build a solcOutput where the contract is stored under a prefixed path
		// e.g. "project/Counter.sol" instead of "Counter.sol"
		const originalEntry =
			counterFixture.solcOutput.contracts['Counter.sol']?.Counter
		if (!originalEntry) throw new Error('fixture contract entry missing')

		const prefixedOutput = {
			...counterFixture.solcOutput,
			contracts: {
				// Remove the original key; use a prefixed version only
				'project/Counter.sol': {
					Counter: originalEntry,
				},
			},
		}

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				...makeClientStub(),
				...makeContainerStub(prefixedOutput),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBeNull()
		expect(job?.verifiedContractId).not.toBeNull()
	})

	it('finds the contract when the output path ends with /contractPath', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		const originalEntry =
			counterFixture.solcOutput.contracts['Counter.sol']?.Counter
		if (!originalEntry) throw new Error('fixture contract entry missing')

		const prefixedOutput = {
			...counterFixture.solcOutput,
			contracts: {
				'/home/user/repo/src/Counter.sol': {
					Counter: originalEntry,
				},
			},
		}

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				...makeClientStub(),
				...makeContainerStub(prefixedOutput),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBeNull()
		expect(job?.verifiedContractId).not.toBeNull()
	})

	it('returns contract_not_found_in_output when no suffix match exists', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		const originalEntry =
			counterFixture.solcOutput.contracts['Counter.sol']?.Counter
		if (!originalEntry) throw new Error('fixture contract entry missing')

		const unrelatedOutput = {
			...counterFixture.solcOutput,
			contracts: {
				'OtherFile.sol': {
					Counter: originalEntry,
				},
			},
		}

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				...makeClientStub(),
				...makeContainerStub(unrelatedOutput),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBe('contract_not_found_in_output')
	})
})

// ---------------------------------------------------------------------------
// 2. Signature persistence for mixed ABI items (function/event/error)
// ---------------------------------------------------------------------------
describe('runVerificationJob – compiled_contracts_signatures persistence', () => {
	it('persists function, event, and error signatures from ABI', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		// Extend the Counter ABI with a custom error
		const originalEntry =
			counterFixture.solcOutput.contracts['Counter.sol']?.Counter
		if (!originalEntry) throw new Error('fixture contract entry missing')

		const extendedAbi = [
			...originalEntry.abi,
			{
				inputs: [
					{ internalType: 'uint256', name: 'requested', type: 'uint256' },
					{ internalType: 'uint256', name: 'available', type: 'uint256' },
				],
				name: 'InsufficientBalance',
				type: 'error',
			},
		]

		const solcOutputWithError = {
			...counterFixture.solcOutput,
			contracts: {
				'Counter.sol': {
					Counter: {
						...originalEntry,
						abi: extendedAbi,
					},
				},
			},
		}

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				...makeClientStub(),
				...makeContainerStub(solcOutputWithError),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBeNull()

		const db = drizzle(env.CONTRACTS_DB)

		// Query all signatures linked to this compilation
		const sigLinks = await db
			.select({
				signature: DB.signaturesTable.signature,
				signatureType: DB.compiledContractsSignaturesTable.signatureType,
			})
			.from(DB.compiledContractsSignaturesTable)
			.innerJoin(
				DB.signaturesTable,
				eq(
					DB.compiledContractsSignaturesTable.signatureHash32,
					DB.signaturesTable.signatureHash32,
				),
			)

		const byType = (t: string) => sigLinks.filter((s) => s.signatureType === t)

		const functions = byType('function')
		const events = byType('event')
		const errors = byType('error')

		// The Counter ABI has these named items:
		// functions: count(), decrement(), increment(), owner(), setCount(uint256)
		// events:    CountChanged(uint256)
		// errors:    InsufficientBalance(uint256,uint256) (added above)
		expect(functions.map((f) => f.signature).sort()).toEqual([
			'count()',
			'decrement()',
			'increment()',
			'owner()',
			'setCount(uint256)',
		])

		expect(events.map((e) => e.signature)).toEqual(['CountChanged(uint256)'])

		expect(errors.map((e) => e.signature)).toEqual([
			'InsufficientBalance(uint256,uint256)',
		])
	})
})

// ---------------------------------------------------------------------------
// 3. Source path normalization persistence for odd input paths
// ---------------------------------------------------------------------------
describe('runVerificationJob – source path normalization persistence', () => {
	it('normalizes absolute source paths before persisting to compiled_contracts_sources', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		// Use an absolute path as the source key
		const oddSourcePath = '/home/user/project/src/Counter.sol'
		const stdJsonInputWithAbsPath = {
			...counterFixture.stdJsonInput,
			sources: {
				[oddSourcePath]: { content: counterSource },
			},
		}

		// The compiler output still references "Counter.sol" in its contracts map
		await runVerificationJob(
			env,
			{
				...JOB_DEFAULTS,
				jobId,
				stdJsonInput: stdJsonInputWithAbsPath,
			},
			{
				...makeClientStub(),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBeNull()

		const db = drizzle(env.CONTRACTS_DB)
		const sources = await db
			.select({ path: DB.compiledContractsSourcesTable.path })
			.from(DB.compiledContractsSourcesTable)

		expect(sources).toHaveLength(1)
		// normalizeSourcePath strips the prefix up to /src/ yielding "src/Counter.sol"
		expect(sources[0]?.path).toBe('src/Counter.sol')
	})

	it('preserves relative paths that are already clean', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				...makeClientStub(),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.errorCode).toBeNull()

		const db = drizzle(env.CONTRACTS_DB)
		const sources = await db
			.select({ path: DB.compiledContractsSourcesTable.path })
			.from(DB.compiledContractsSourcesTable)

		expect(sources).toHaveLength(1)
		// "Counter.sol" is already relative, should pass through unchanged
		expect(sources[0]?.path).toBe('Counter.sol')
	})

	it('normalizes /contracts/ prefix in source paths', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		const oddSourcePath = '/opt/build/contracts/Counter.sol'
		const stdJsonInputWithAbsPath = {
			...counterFixture.stdJsonInput,
			sources: {
				[oddSourcePath]: { content: counterSource },
			},
		}

		await runVerificationJob(
			env,
			{
				...JOB_DEFAULTS,
				jobId,
				stdJsonInput: stdJsonInputWithAbsPath,
			},
			{
				...makeClientStub(),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.errorCode).toBeNull()

		const db = drizzle(env.CONTRACTS_DB)
		const sources = await db
			.select({ path: DB.compiledContractsSourcesTable.path })
			.from(DB.compiledContractsSourcesTable)

		expect(sources).toHaveLength(1)
		expect(sources[0]?.path).toBe('contracts/Counter.sol')
	})

	it('falls back to filename for unrecognized absolute paths', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		const oddSourcePath = '/weird/deep/nested/Counter.sol'
		const stdJsonInputWithAbsPath = {
			...counterFixture.stdJsonInput,
			sources: {
				[oddSourcePath]: { content: counterSource },
			},
		}

		await runVerificationJob(
			env,
			{
				...JOB_DEFAULTS,
				jobId,
				stdJsonInput: stdJsonInputWithAbsPath,
			},
			{
				...makeClientStub(),
				...makeContainerStub(),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.errorCode).toBeNull()

		const db = drizzle(env.CONTRACTS_DB)
		const sources = await db
			.select({ path: DB.compiledContractsSourcesTable.path })
			.from(DB.compiledContractsSourcesTable)

		expect(sources).toHaveLength(1)
		// No recognized pattern → falls back to filename
		expect(sources[0]?.path).toBe('Counter.sol')
	})
})

// ---------------------------------------------------------------------------
// 4. ABI with unsupported / malformed items
// ---------------------------------------------------------------------------
describe('runVerificationJob – ABI with unsupported/malformed items', () => {
	it('skips constructor, receive, and fallback ABI items without failing', async () => {
		const jobId = globalThis.crypto.randomUUID()
		await insertJobRow(jobId)

		const originalEntry =
			counterFixture.solcOutput.contracts['Counter.sol']?.Counter
		if (!originalEntry) throw new Error('fixture contract entry missing')

		// Build an ABI that includes unsupported types alongside real ones
		const mixedAbi = [
			// constructor – no name, no signature
			{
				inputs: [
					{ internalType: 'uint256', name: 'initialCount', type: 'uint256' },
				],
				stateMutability: 'nonpayable',
				type: 'constructor',
			},
			// receive – no name, no signature
			{ stateMutability: 'payable', type: 'receive' },
			// fallback – no name, no signature
			{ stateMutability: 'nonpayable', type: 'fallback' },
			// a valid function
			{
				inputs: [],
				name: 'count',
				outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
				stateMutability: 'view',
				type: 'function',
			},
			// a valid event
			{
				anonymous: false,
				inputs: [
					{
						indexed: false,
						internalType: 'uint256',
						name: 'newCount',
						type: 'uint256',
					},
				],
				name: 'CountChanged',
				type: 'event',
			},
			// an item with an unknown type (future-proofing)
			{
				inputs: [],
				name: 'SomeFutureThing',
				type: 'someFutureType',
			},
		]

		const solcOutputMixed = {
			...counterFixture.solcOutput,
			contracts: {
				'Counter.sol': {
					Counter: {
						...originalEntry,
						abi: mixedAbi,
					},
				},
			},
		}

		await runVerificationJob(
			env,
			{ ...JOB_DEFAULTS, jobId },
			{
				...makeClientStub(),
				...makeContainerStub(solcOutputMixed),
			},
		)

		const job = await getJobRow(jobId)
		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBeNull()
		expect(job?.verifiedContractId).not.toBeNull()

		// Only the function and event should have signatures persisted
		const db = drizzle(env.CONTRACTS_DB)
		const sigLinks = await db
			.select({
				signature: DB.signaturesTable.signature,
				signatureType: DB.compiledContractsSignaturesTable.signatureType,
			})
			.from(DB.compiledContractsSignaturesTable)
			.innerJoin(
				DB.signaturesTable,
				eq(
					DB.compiledContractsSignaturesTable.signatureHash32,
					DB.signaturesTable.signatureHash32,
				),
			)

		expect(sigLinks).toHaveLength(2)
		const signatures = sigLinks.map((s) => s.signature).sort()
		expect(signatures).toEqual(['CountChanged(uint256)', 'count()'])
	})
})
