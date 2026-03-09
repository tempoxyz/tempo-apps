import * as z from 'zod/mini'
import { env, SELF, fetchMock } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { describe, it, expect, beforeAll, afterEach } from 'vitest'

import * as DB from '#database/schema.ts'
import { counterFixture } from '../fixtures/counter.fixture.ts'

const VerificationIdSchema = z.object({ verificationId: z.string() })
const VerificationStatusSchema = z.object({ isJobCompleted: z.boolean() })
const ErrorResponseSchema = z.object({ customCode: z.string() })
const RpcBodySchema = z.object({
	method: z.optional(z.string()),
	id: z.optional(z.number()),
})

const getFirst = <T>(items: T[], label: string) => {
	const value = items.at(0)
	if (!value) throw new Error(`Expected ${label} to have at least one item`)
	return value
}

beforeAll(() => {
	fetchMock.activate()
	fetchMock.disableNetConnect()
})

afterEach(() => {
	fetchMock.deactivate()
	fetchMock.activate()
	fetchMock.disableNetConnect()
})

describe('full verification flow', () => {
	function setupMocks() {
		fetchMock
			.get('http://container')
			.intercept({ path: '/compile', method: 'POST' })
			.reply(200, counterFixture.solcOutput)
			.persist()

		fetchMock
			.get('https://rpc.devnet.tempoxyz.dev')
			.intercept({ path: '/', method: 'POST' })
			.reply(200, (opts) => {
				const parsedBody =
					typeof opts.body === 'string'
						? z.safeParse(RpcBodySchema, JSON.parse(opts.body))
						: undefined
				const body = parsedBody?.success ? parsedBody.data : undefined
				if (body?.method === 'eth_getCode') {
					return {
						jsonrpc: '2.0',
						id: body.id,
						result: counterFixture.onchainRuntimeBytecode,
					}
				}
				if (body?.method === 'eth_chainId') {
					return { jsonrpc: '2.0', id: body.id, result: '0x7a56' }
				}
				return { jsonrpc: '2.0', id: body?.id ?? 1, result: undefined }
			})
			.persist()
	}

	it('verifies a simple contract and persists to database', async () => {
		setupMocks()

		const verifyResponse = await SELF.fetch(
			`https://test.local/v2/verify/${counterFixture.chainId}/${counterFixture.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stdJsonInput: counterFixture.stdJsonInput,
					compilerVersion: counterFixture.compilerVersion,
					contractIdentifier: counterFixture.contractIdentifier,
				}),
			},
		)

		if (verifyResponse.status !== 202) {
			console.error('Verify failed:', await verifyResponse.clone().text())
		}
		expect(verifyResponse.status).toBe(202)
		const verificationIdJson = await verifyResponse.json()
		const { verificationId } = z.parse(VerificationIdSchema, verificationIdJson)

		let isJobCompleted = false
		let attempts = 0
		while (!isJobCompleted && attempts < 50) {
			await new Promise((r) => setTimeout(r, 50))
			const statusResponse = await SELF.fetch(
				`https://test.local/v2/verify/${verificationId}`,
			)
			const statusJson = await statusResponse.json()
			isJobCompleted = z.parse(
				VerificationStatusSchema,
				statusJson,
			).isJobCompleted
			attempts++
		}

		expect(isJobCompleted).toBe(true)

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
		setupMocks()

		const verifyResponse = await SELF.fetch(
			`https://test.local/v2/verify/${counterFixture.chainId}/${counterFixture.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stdJsonInput: counterFixture.stdJsonInput,
					compilerVersion: counterFixture.compilerVersion,
					contractIdentifier: counterFixture.contractIdentifier,
				}),
			},
		)

		const verificationIdJson = await verifyResponse.json()
		const { verificationId } = z.parse(VerificationIdSchema, verificationIdJson)

		let isJobCompleted = false
		let attempts = 0
		while (!isJobCompleted && attempts < 50) {
			await new Promise((r) => setTimeout(r, 50))
			const statusResponse = await SELF.fetch(
				`https://test.local/v2/verify/${verificationId}`,
			)
			const statusJson = await statusResponse.json()
			isJobCompleted = z.parse(
				VerificationStatusSchema,
				statusJson,
			).isJobCompleted
			attempts++
		}

		expect(isJobCompleted).toBe(true)

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
		setupMocks()

		const firstResponse = await SELF.fetch(
			`https://test.local/v2/verify/${counterFixture.chainId}/${counterFixture.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stdJsonInput: counterFixture.stdJsonInput,
					compilerVersion: counterFixture.compilerVersion,
					contractIdentifier: counterFixture.contractIdentifier,
				}),
			},
		)

		const verificationIdJson = await firstResponse.json()
		const { verificationId } = z.parse(VerificationIdSchema, verificationIdJson)

		let isJobCompleted = false
		let attempts = 0
		while (!isJobCompleted && attempts < 50) {
			await new Promise((r) => setTimeout(r, 50))
			const statusResponse = await SELF.fetch(
				`https://test.local/v2/verify/${verificationId}`,
			)
			const statusJson = await statusResponse.json()
			isJobCompleted = z.parse(
				VerificationStatusSchema,
				statusJson,
			).isJobCompleted
			attempts++
		}

		expect(isJobCompleted).toBe(true)

		const secondResponse = await SELF.fetch(
			`https://test.local/v2/verify/${counterFixture.chainId}/${counterFixture.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					stdJsonInput: counterFixture.stdJsonInput,
					compilerVersion: counterFixture.compilerVersion,
					contractIdentifier: counterFixture.contractIdentifier,
				}),
			},
		)

		expect(secondResponse.status).toBe(409)
		const bodyJson = await secondResponse.json()
		expect(z.parse(ErrorResponseSchema, bodyJson).customCode).toBe(
			'already_verified',
		)
	})
})
