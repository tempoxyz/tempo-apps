import { env, SELF } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { verificationJobsTable } from '#database/schema.ts'

// Simple contract source for testing
const TEST_CONTRACT_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimpleStorage {
    uint256 private value;

    function setValue(uint256 _value) public {
        value = _value;
    }

    function getValue() public view returns (uint256) {
        return value;
    }
}
`

describe('POST /v2/verify/:chainId/:address - Async verification', () => {
	const chainId = env.TEST_CHAIN_ID
	const chainName = env.TEST_CHAIN_NAME

	beforeAll(() => {
		console.log(
			`Running verify tests against ${chainName} (chainId: ${chainId})`,
		)
	})

	beforeEach(async () => {
		const db = drizzle(env.CONTRACTS_DB)
		await db.delete(verificationJobsTable)
	})

	it('returns 400 for unsupported chain', async () => {
		const response = await SELF.fetch(
			'http://localhost/v2/verify/999999/0x1234567890123456789012345678901234567890',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stdJsonInput: {
						language: 'Solidity',
						sources: { 'Test.sol': { content: TEST_CONTRACT_SOURCE } },
						settings: {},
					},
					compilerVersion: '0.8.20',
					contractIdentifier: 'Test.sol:SimpleStorage',
				}),
			},
		)

		expect(response.status).toBe(400)
		const body = (await response.json()) as { customCode: string }
		expect(body.customCode).toBe('unsupported_chain')
	})

	it('returns 400 for invalid address', async () => {
		const response = await SELF.fetch(
			`http://localhost/v2/verify/${chainId}/0xinvalid`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stdJsonInput: {
						language: 'Solidity',
						sources: { 'Test.sol': { content: TEST_CONTRACT_SOURCE } },
						settings: {},
					},
					compilerVersion: '0.8.20',
					contractIdentifier: 'Test.sol:SimpleStorage',
				}),
			},
		)

		expect(response.status).toBe(400)
		const body = (await response.json()) as { customCode: string }
		expect(body.customCode).toBe('invalid_address')
	})

	it('returns 202 with verificationId for valid request', async () => {
		const testAddress = '0x1234567890123456789012345678901234567890'

		const response = await SELF.fetch(
			`http://localhost/v2/verify/${chainId}/${testAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stdJsonInput: {
						language: 'Solidity',
						sources: { 'SimpleStorage.sol': { content: TEST_CONTRACT_SOURCE } },
						settings: {},
					},
					compilerVersion: '0.8.20',
					contractIdentifier: 'SimpleStorage.sol:SimpleStorage',
				}),
			},
		)

		// Should return 202 with job ID immediately (async flow)
		expect(response.status).toBe(202)
		const body = (await response.json()) as { verificationId: string }
		expect(body.verificationId).toBeDefined()
		expect(body.verificationId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		)
	})

	it('creates a pending job in the database', async () => {
		const testAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

		const response = await SELF.fetch(
			`http://localhost/v2/verify/${chainId}/${testAddress}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stdJsonInput: {
						language: 'Solidity',
						sources: { 'SimpleStorage.sol': { content: TEST_CONTRACT_SOURCE } },
						settings: {},
					},
					compilerVersion: '0.8.20',
					contractIdentifier: 'SimpleStorage.sol:SimpleStorage',
				}),
			},
		)

		expect(response.status).toBe(202)
		const body = (await response.json()) as { verificationId: string }

		// Verify job was created in database
		const db = drizzle(env.CONTRACTS_DB)
		const jobs = await db
			.select()
			.from(verificationJobsTable)
			.where(eq(verificationJobsTable.id, body.verificationId))

		expect(jobs).toHaveLength(1)
		expect(jobs[0]?.chainId).toBe(chainId)
		expect(jobs[0]?.verificationEndpoint).toBe('/v2/verify')
	})
})

describe('GET /v2/verify/:verificationId - Poll job status', () => {
	const chainId = env.TEST_CHAIN_ID

	beforeEach(async () => {
		const db = drizzle(env.CONTRACTS_DB)
		await db.delete(verificationJobsTable)
	})

	it('returns 404 for non-existent job', async () => {
		const fakeJobId = '00000000-0000-0000-0000-000000000000'

		const response = await SELF.fetch(`http://localhost/v2/verify/${fakeJobId}`)

		expect(response.status).toBe(404)
		const body = (await response.json()) as { customCode: string }
		expect(body.customCode).toBe('not_found')
	})

	it('returns isJobCompleted: false for pending job', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const jobId = crypto.randomUUID()
		const addressBytes = new Uint8Array(20).fill(0x12)

		// Insert pending job
		await db.insert(verificationJobsTable).values({
			id: jobId,
			chainId,
			contractAddress: addressBytes,
			verificationEndpoint: '/v2/verify',
		})

		const response = await SELF.fetch(`http://localhost/v2/verify/${jobId}`)

		expect(response.status).toBe(200)
		const body = (await response.json()) as {
			isJobCompleted: boolean
			jobId: string
			chainId: number
		}
		expect(body.isJobCompleted).toBe(false)
		expect(body.jobId).toBe(jobId)
		expect(body.chainId).toBe(chainId)
	})

	it('returns error details for failed job', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const jobId = crypto.randomUUID()
		const addressBytes = new Uint8Array(20).fill(0x34)

		// Insert failed job
		await db.insert(verificationJobsTable).values({
			id: jobId,
			chainId,
			contractAddress: addressBytes,
			verificationEndpoint: '/v2/verify',
			completedAt: new Date().toISOString(),
			errorCode: 'compilation_failed',
			errorData: JSON.stringify({ message: 'solc crashed unexpectedly' }),
		})

		const response = await SELF.fetch(`http://localhost/v2/verify/${jobId}`)

		expect(response.status).toBe(400)
		const body = (await response.json()) as {
			isJobCompleted: boolean
			error: { customCode: string; message: string }
		}
		expect(body.isJobCompleted).toBe(true)
		expect(body.error.customCode).toBe('compilation_failed')
		expect(body.error.message).toBe('solc crashed unexpectedly')
	})
})

describe(`Chain-specific tests (${env.TEST_CHAIN_NAME})`, () => {
	const chainId = env.TEST_CHAIN_ID
	const chainName = env.TEST_CHAIN_NAME

	it(`accepts chain ID ${chainId} (${chainName})`, async () => {
		// Just verify the chain ID is accepted without making network calls
		const response = await SELF.fetch(
			`http://localhost/v2/verify/${chainId}/0x1234567890123456789012345678901234567890`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stdJsonInput: {
						language: 'Solidity',
						sources: { 'Test.sol': { content: 'contract Test {}' } },
						settings: {},
					},
					compilerVersion: '0.8.20',
					contractIdentifier: 'Test.sol:Test',
				}),
			},
		)

		// Should return 202 (accepted) or fail later in the async job, not 400 (unsupported chain)
		expect(response.status).toBe(202)
	})
})
