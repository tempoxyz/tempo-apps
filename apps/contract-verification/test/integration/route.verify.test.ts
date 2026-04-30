import * as z from 'zod/mini'
import { Hex } from 'ox'
import { eq } from 'drizzle-orm'
import { SELF, env } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { describe, it, expect } from 'vitest'

import * as DB from '#database/schema.ts'
import { app } from '#index.tsx'
import { chainIds } from '#wagmi.config.ts'
import { counterFixture } from '../fixtures/counter.fixture.ts'
import { vyperFixture } from '../fixtures/vyper.fixture.ts'

async function requestFromWorker(
	path: string,
	init?: RequestInit,
): Promise<Response> {
	return SELF.fetch(`https://test.local${path}`, init)
}

describe('POST /v2/verify/:chainId/:address', () => {
	const validChainId = chainIds[0]
	if (!validChainId) {
		throw new Error('expected at least one configured chain ID')
	}

	const validAddress = '0x1234567890123456789012345678901234567890'
	const validBody = {
		stdJsonInput: {
			language: 'Solidity',
			settings: {
				optimizer: { enabled: true, runs: 200 },
				outputSelection: {
					'*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] },
				},
			},
			sources: {
				'contracts/Token.sol': {
					content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Token {
    string public name = "Test";
}`,
				},
			},
		},
		compilerVersion: '0.8.20',
		contractIdentifier: 'contracts/Token.sol:Token',
	}

	it('returns 202 and inserts a verification job row for a fully valid request', async () => {
		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/${validAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
		)

		expect(response.status).toBe(202)
		const body = z.parse(
			z.object({ verificationId: z.uuidv4() }),
			await response.json(),
		)
		expect(body.verificationId).toBeTruthy()

		const db = drizzle(env.CONTRACTS_DB)
		const [job] = await db
			.select()
			.from(DB.verificationJobsTable)
			.where(eq(DB.verificationJobsTable.id, body.verificationId))
			.limit(1)

		expect(job).toBeDefined()
		if (!job) throw new Error('expected verification job row')
		expect(job.chainId).toBe(validChainId)
		expect(new Uint8Array(job.contractAddress as ArrayBuffer)).toEqual(
			Hex.toBytes(validAddress),
		)
		expect(job.verificationEndpoint).toBe('/v2/verify')
		expect(job.startedAt).not.toBeNull()
		expect(job.completedAt).toBeNull()
		expect(job.errorCode).toBeNull()
		expect(job.verifiedContractId).toBeNull()
	})

	it('returns 400 with invalid_chain_id for non-numeric chain ID', async () => {
		const response = await requestFromWorker(
			'/v2/verify/not-a-chain/0x1234567890123456789012345678901234567890',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
		)

		expect(response.status).toBe(400)
		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('invalid_chain_id')
	})

	it('returns 400 with invalid_chain_id for non-decimal chain ID', async () => {
		const response = await requestFromWorker(
			`/v2/verify/${validChainId}e0/0x1234567890123456789012345678901234567890`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
		)

		expect(response.status).toBe(400)
		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('invalid_chain_id')
	})

	it('returns 400 with unsupported_chain for unsupported chain ID', async () => {
		const response = await requestFromWorker(
			'/v2/verify/999999/0x1234567890123456789012345678901234567890',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
		)

		expect(response.status).toBe(400)
		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('unsupported_chain')
	})

	it('returns 400 with invalid_address for invalid address format', async () => {
		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/invalid-address`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
		)

		expect(response.status).toBe(400)
		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('invalid_address')
	})

	it('returns 400 for invalid JSON body', async () => {
		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/${validAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not valid json',
			},
		)

		expect(response.status).toBe(400)
	})

	it('returns 400 for missing required fields', async () => {
		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/${validAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					compilerVersion: '0.8.20',
					contractIdentifier: 'Token',
				}),
			},
		)

		expect(response.status).toBe(400)
	})

	it('returns 400 with invalid_contract_identifier when contractIdentifier has no colon', async () => {
		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/${validAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...validBody,
					contractIdentifier: 'TokenWithoutColon',
				}),
			},
		)

		expect(response.status).toBe(400)
		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('invalid_contract_identifier')
	})

	it('returns 409 when contract is already verified', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const addressBytes = Hex.toBytes(validAddress)
		const runtimeHash = new Uint8Array(32).fill(0xaa)
		const creationHash = new Uint8Array(32).fill(0xbb)
		const runtimeKeccak = new Uint8Array(32).fill(0xcc)
		const creationKeccak = new Uint8Array(32).fill(0xdd)

		await db.insert(DB.codeTable).values([
			{
				codeHash: runtimeHash,
				codeHashKeccak: runtimeKeccak,
				code: new Uint8Array([1]),
			},
			{
				codeHash: creationHash,
				codeHashKeccak: creationKeccak,
				code: new Uint8Array([2]),
			},
		])

		const contractId = crypto.randomUUID()
		await db.insert(DB.contractsTable).values({
			id: contractId,
			creationCodeHash: creationHash,
			runtimeCodeHash: runtimeHash,
		})

		const deploymentId = crypto.randomUUID()
		await db.insert(DB.contractDeploymentsTable).values({
			id: deploymentId,
			chainId: validChainId,
			address: addressBytes,
			contractId,
		})

		const compilationId = crypto.randomUUID()
		await db.insert(DB.compiledContractsTable).values({
			id: compilationId,
			compiler: 'solc',
			version: validBody.compilerVersion,
			language: validBody.stdJsonInput.language,
			name: 'Token',
			fullyQualifiedName: validBody.contractIdentifier,
			compilerSettings: '{}',
			compilationArtifacts: '{}',
			creationCodeHash: creationHash,
			creationCodeArtifacts: '{}',
			runtimeCodeHash: runtimeHash,
			runtimeCodeArtifacts: '{}',
		})

		await db.insert(DB.verifiedContractsTable).values({
			deploymentId,
			compilationId,
			creationMatch: false,
			runtimeMatch: true,
			runtimeMetadataMatch: true,
		})

		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/${validAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
		)

		expect(response.status).toBe(409)
		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('already_verified')
	})

	it('returns 429 for a duplicate in-flight request', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		await db.insert(DB.verificationJobsTable).values({
			id: crypto.randomUUID(),
			chainId: validChainId,
			contractAddress: Hex.toBytes(validAddress),
			verificationEndpoint: '/v2/verify',
		})

		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/${validAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
		)

		expect(response.status).toBe(429)
		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('duplicate_verification_request')
	})

	it('expires a stale pending job and replaces it with a new verification request', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const staleJobId = crypto.randomUUID()
		await db.insert(DB.verificationJobsTable).values({
			id: staleJobId,
			chainId: validChainId,
			contractAddress: Hex.toBytes(validAddress),
			verificationEndpoint: '/v2/verify',
			startedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
		})

		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/${validAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
		)

		expect(response.status).toBe(202)
		const body = z.parse(
			z.object({ verificationId: z.uuidv4() }),
			await response.json(),
		)
		expect(body.verificationId).not.toBe(staleJobId)

		const [staleJob] = await db
			.select({
				completedAt: DB.verificationJobsTable.completedAt,
				errorCode: DB.verificationJobsTable.errorCode,
			})
			.from(DB.verificationJobsTable)
			.where(eq(DB.verificationJobsTable.id, staleJobId))
			.limit(1)

		expect(staleJob?.completedAt).not.toBeNull()
		expect(staleJob?.errorCode).toBe('timeout')
	})

	it('returns 500 and removes the verification_jobs row when DO enqueue throws', async () => {
		const mockEnv = {
			...env,
			VERIFICATION_JOB_RUNNER: {
				idFromName: (_name: string) => ({ name: _name }),
				get: (_id: unknown) => ({
					enqueue: async () => {
						throw new Error('Simulated DO enqueue failure')
					},
				}),
			},
		} as unknown as typeof env

		const response = await app.request(
			`/v2/verify/${counterFixture.chainId}/${counterFixture.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stdJsonInput: counterFixture.stdJsonInput,
					compilerVersion: counterFixture.compilerVersion,
					contractIdentifier: counterFixture.contractIdentifier,
				}),
			},
			mockEnv,
		)

		expect(response.status).toBe(500)
		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('internal_error')

		const db = drizzle(env.CONTRACTS_DB)
		const jobs = await db.select().from(DB.verificationJobsTable)
		expect(jobs).toHaveLength(0)
	})

	it('accepts a lowercase non-checksummed address and returns 202', async () => {
		const lowercaseAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/${lowercaseAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
		)

		expect(response.status).toBe(202)
	})

	it('returns 400 for a numerically valid but unsupported chain ID', async () => {
		const response = await requestFromWorker(`/v2/verify/1/${validAddress}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(validBody),
		})

		expect(response.status).toBe(400)
	})
})

describe('POST /v2/verify/:chainId/:address – Vyper payload', () => {
	const validChainId = chainIds[0]
	if (!validChainId) {
		throw new Error('expected at least one configured chain ID')
	}

	const vyperAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
	const vyperBody = {
		stdJsonInput: vyperFixture.stdJsonInput,
		compilerVersion: vyperFixture.compilerVersion,
		contractIdentifier: vyperFixture.contractIdentifier,
	}

	it('returns 202 and inserts a job row for a valid Vyper standard-json request', async () => {
		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/${vyperAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(vyperBody),
			},
		)

		expect(response.status).toBe(202)
		const body = z.parse(
			z.object({ verificationId: z.uuidv4() }),
			await response.json(),
		)
		expect(body.verificationId).toBeTruthy()

		const db = drizzle(env.CONTRACTS_DB)
		const [job] = await db
			.select()
			.from(DB.verificationJobsTable)
			.where(eq(DB.verificationJobsTable.id, body.verificationId))
			.limit(1)

		expect(job).toBeDefined()
		if (!job) throw new Error('expected verification job row')
		expect(job.chainId).toBe(validChainId)
		expect(new Uint8Array(job.contractAddress as ArrayBuffer)).toEqual(
			Hex.toBytes(vyperAddress),
		)
		expect(job.verificationEndpoint).toBe('/v2/verify')
		expect(job.startedAt).not.toBeNull()
		expect(job.completedAt).toBeNull()
	})

	it('returns 400 for Vyper payload with invalid contractIdentifier (no colon)', async () => {
		const response = await requestFromWorker(
			`/v2/verify/${validChainId}/${vyperAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...vyperBody,
					contractIdentifier: 'vyper_contract_no_colon',
				}),
			},
		)

		expect(response.status).toBe(400)
		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('invalid_contract_identifier')
	})
})

describe('POST /metadata/:chainId/:address', () => {
	it('returns 501 not implemented', async () => {
		const response = await requestFromWorker(
			'/v2/verify/metadata/1/0x1234567890123456789012345678901234567890',
			{ method: 'POST' },
		)

		expect(response.status).toBe(501)

		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('not_implemented')
	})
})

describe('POST /similarity/:chainId/:address', () => {
	it('returns 501 not implemented', async () => {
		const response = await requestFromWorker(
			'/v2/verify/similarity/1/0x1234567890123456789012345678901234567890',
			{ method: 'POST' },
		)

		expect(response.status).toBe(501)

		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('not_implemented')
	})
})
