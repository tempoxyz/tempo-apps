import { env, SELF } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { Hex } from 'ox'
import { describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import { app } from '#index.tsx'
import { ChainRegistry } from '#lib/chain-registry.ts'
import { runVerificationJob } from '#route.verify.ts'
import { staticChains } from '#wagmi.config.ts'
import { counterFixture } from '../fixtures/counter.fixture.ts'

const registry = ChainRegistry.fromStatic(staticChains)
const transactionHash = `0x${'ab'.repeat(32)}` as const
const otherHash = `0x${'cd'.repeat(32)}` as const
const deployer = '0x2222222222222222222222222222222222222222' as const
const receipt = {
	transactionHash,
	blockNumber: 42n,
	transactionIndex: 3,
	cumulativeGasUsed: 1_000_000n,
	from: deployer,
	contractAddress: counterFixture.address as string | null,
	status: 'success' as const,
}
const body = {
	stdJsonInput: counterFixture.stdJsonInput,
	compilerVersion: counterFixture.compilerVersion,
	contractIdentifier: counterFixture.contractIdentifier,
}
const target = {
	chainId: counterFixture.chainId,
	address: counterFixture.address,
}

async function insertJob() {
	const jobId = crypto.randomUUID()
	await drizzle(env.CONTRACTS_DB)
		.insert(DB.verificationJobsTable)
		.values({
			id: jobId,
			chainId: target.chainId,
			contractAddress: Hex.toBytes(target.address),
			verificationEndpoint: '/v2/verify',
		})
	return jobId
}

async function seedExact() {
	const jobId = await insertJob()
	await runVerificationJob(env, { ...target, ...body, jobId }, registry, {
		createPublicClient: () => ({
			getCode: async () => counterFixture.onchainRuntimeBytecode,
		}),
		getContainer: () => ({
			fetch: async () => Response.json(counterFixture.solcOutput),
		}),
	})
	const db = drizzle(env.CONTRACTS_DB)
	const [verification] = await db.select().from(DB.verifiedContractsTable)
	if (!verification) throw new Error('Expected seeded exact verification')
	expect(verification.runtimeMetadataMatch).toBe(true)
	return verification
}

async function sourceSnapshot() {
	const db = drizzle(env.CONTRACTS_DB)
	return Promise.all([
		db.select().from(DB.verifiedContractsTable),
		db.select().from(DB.compiledContractsTable),
		db.select().from(DB.compiledContractsSourcesTable),
		db.select().from(DB.sourcesTable),
		db.select().from(DB.compiledContractsSignaturesTable),
		db.select().from(DB.contractsTable),
		db.select().from(DB.codeTable),
	])
}

async function repair(
	getReceipt: () => Promise<typeof receipt> = async () => receipt,
	jobId?: string,
	trace?: unknown,
) {
	const id = jobId ?? (await insertJob())
	await runVerificationJob(
		env,
		{
			...target,
			...body,
			jobId: id,
			creationTransactionHash: transactionHash,
			// A metadata repair must never compile or publish this unrelated submission.
			stdJsonInput: {
				...body.stdJsonInput,
				sources: { 'Unrelated.sol': { content: 'contract Unrelated {}' } },
			},
		},
		registry,
		{
			createPublicClient: () => ({
				getCode: async () => {
					throw new Error('Repair must not reverify runtime sources')
				},
				getTransactionReceipt: getReceipt,
				...(trace ? { transport: { request: async () => trace } } : {}),
			}),
			getContainer: () => {
				throw new Error('Repair must not compile')
			},
		},
	)
	const [job] = await drizzle(env.CONTRACTS_DB)
		.select()
		.from(DB.verificationJobsTable)
		.where(eq(DB.verificationJobsTable.id, id))
	return job
}

describe('exact verification creation metadata repair', () => {
	it('refreshes deployment audit fields only when a proven repair commits', async () => {
		const verification = await seedExact()
		const db = drizzle(env.CONTRACTS_DB)
		const oldAudit = {
			updatedAt: '2000-01-01T00:00:00.000Z',
			updatedBy: 'historical-import',
		}
		await db
			.update(DB.contractDeploymentsTable)
			.set(oldAudit)
			.where(eq(DB.contractDeploymentsTable.id, verification.deploymentId))
		const [before] = await db.select().from(DB.contractDeploymentsTable)
		const started = Date.now()
		expect((await repair())?.errorCode).toBeNull()
		const [after] = await db.select().from(DB.contractDeploymentsTable)
		expect(after?.updatedBy).toBe('verification-api')
		expect(Date.parse(after?.updatedAt ?? '')).toBeGreaterThanOrEqual(started)
		expect(Date.parse(after?.updatedAt ?? '')).toBeLessThanOrEqual(Date.now())
		expect(after?.createdAt).toBe(before?.createdAt)
		expect(after?.createdBy).toBe(before?.createdBy)
	})

	it('does not fetch creation evidence for an address without deployed code', async () => {
		const jobId = await insertJob()
		let receiptReads = 0
		await runVerificationJob(
			env,
			{ ...target, ...body, jobId, creationTransactionHash: transactionHash },
			registry,
			{
				createPublicClient: () => ({
					getCode: async () => '0x',
					getTransactionReceipt: async () => {
						receiptReads++
						return receipt
					},
				}),
				getContainer: () => {
					throw new Error('Absent contracts must not compile')
				},
			},
		)
		const [job] = await drizzle(env.CONTRACTS_DB)
			.select()
			.from(DB.verificationJobsTable)
			.where(eq(DB.verificationJobsTable.id, jobId))
		expect(job?.errorCode).toBe('contract_not_found')
		expect(receiptReads).toBe(0)
	})

	it('does not fetch creation evidence for mismatched source submissions', async () => {
		const jobId = await insertJob()
		let receiptReads = 0
		await runVerificationJob(
			env,
			{ ...target, ...body, jobId, creationTransactionHash: transactionHash },
			registry,
			{
				createPublicClient: () => ({
					getCode: async () => '0x6001600055',
					getTransactionReceipt: async () => {
						receiptReads++
						return receipt
					},
				}),
				getContainer: () => ({
					fetch: async () => Response.json(counterFixture.solcOutput),
				}),
			},
		)
		const [job] = await drizzle(env.CONTRACTS_DB)
			.select()
			.from(DB.verificationJobsTable)
			.where(eq(DB.verificationJobsTable.id, jobId))
		expect(job?.errorCode).toBe('no_match')
		expect(receiptReads).toBe(0)
	})

	it('accepts a repair through the public API and preserves the original exact sources', async () => {
		const verification = await seedExact()
		const before = await sourceSnapshot()
		const response = await SELF.fetch(
			`https://test.local/v2/verify/${target.chainId}/${target.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...body,
					creationTransactionHash: transactionHash,
				}),
			},
		)
		expect(response.status).toBe(202)
		const { verificationId } = (await response.json()) as {
			verificationId: string
		}
		const job = await repair(undefined, verificationId)
		expect(job?.errorCode).toBeNull()
		expect(job?.completedAt).not.toBeNull()
		expect(job?.verifiedContractId).toBe(verification.id)
		expect(await sourceSnapshot()).toEqual(before)
		const lookup = await app.request(
			`/v2/contract/${target.chainId}/${target.address}?fields=transactionHash,deployment`,
			{},
			env,
		)
		expect(lookup.status).toBe(200)
		const result = (await lookup.json()) as {
			transactionHash: string
			match: string
		}
		expect(result.transactionHash).toBe(transactionHash)
		expect(result.match).toBe('exact_match')
		const [deployment] = await drizzle(env.CONTRACTS_DB)
			.select()
			.from(DB.contractDeploymentsTable)
		expect(deployment?.blockNumber).toBe(42)
		expect(deployment?.transactionIndex).toBe(3)
		expect(
			Hex.fromBytes(new Uint8Array(deployment?.deployer as ArrayBuffer)),
		).toBe(deployer)
	})

	it('repairs factory creation without recompiling or accepting a later factory call', async () => {
		await seedExact()
		const before = await sourceSnapshot()
		const factory = '0x4444444444444444444444444444444444444444'
		const factoryReceipt = async () => ({ ...receipt, contractAddress: null })
		const call = { type: 'CALL', from: deployer, to: factory }
		expect((await repair(factoryReceipt, undefined, call))?.errorCode).toBe(
			'invalid_creation_transaction',
		)
		const trace = {
			...call,
			calls: [{ type: 'CREATE2', from: factory, to: target.address }],
		}
		expect(
			(await repair(factoryReceipt, undefined, trace))?.errorCode,
		).toBeNull()
		expect(await sourceSnapshot()).toEqual(before)
	})

	it('retains already_verified for a request without a hash or with an already populated hash', async () => {
		const verification = await seedExact()
		for (const populated of [false, true]) {
			if (populated)
				await drizzle(env.CONTRACTS_DB)
					.update(DB.contractDeploymentsTable)
					.set({ transactionHash: Hex.toBytes(transactionHash) })
					.where(eq(DB.contractDeploymentsTable.id, verification.deploymentId))
			const response = await SELF.fetch(
				`https://test.local/v2/verify/${target.chainId}/${target.address}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						...body,
						...(populated ? { creationTransactionHash: otherHash } : {}),
					}),
				},
			)
			expect(response.status).toBe(409)
		}
	})

	it.each([
		1, 2,
	])('does not claim source verification when %i exact records appear before a queued job runs', async (count) => {
		const jobId = await insertJob()
		const verification = await seedExact()
		const db = drizzle(env.CONTRACTS_DB)
		if (count === 2) await duplicateExact(verification)
		const sources = await sourceSnapshot()
		const deployments = await db.select().from(DB.contractDeploymentsTable)
		await runVerificationJob(
			env,
			{
				...target,
				...body,
				jobId,
				stdJsonInput: {
					...body.stdJsonInput,
					sources: { 'Unrelated.sol': { content: 'contract Unrelated {}' } },
				},
			},
			registry,
			{
				createPublicClient: () => ({
					getCode: async () => {
						throw new Error('Already-verified jobs must not fetch code')
					},
				}),
				getContainer: () => {
					throw new Error('Already-verified jobs must not compile')
				},
			},
		)
		const [job] = await db
			.select()
			.from(DB.verificationJobsTable)
			.where(eq(DB.verificationJobsTable.id, jobId))
		expect(job?.errorCode).toBe('already_verified')
		expect(job?.verifiedContractId).toBeNull()
		expect(job?.completedAt).not.toBeNull()
		expect(await sourceSnapshot()).toEqual(sources)
		expect(await db.select().from(DB.contractDeploymentsTable)).toEqual(
			deployments,
		)
	})

	it.each([
		'no hash',
		'both populated',
		'one populated',
	] as const)('preserves already_verified for duplicate records with %s', async (mode) => {
		const verification = await seedExact()
		const db = drizzle(env.CONTRACTS_DB)
		const siblingId = await duplicateExact(verification)
		if (mode === 'both populated') {
			await db
				.update(DB.contractDeploymentsTable)
				.set({ transactionHash: Hex.toBytes(transactionHash) })
				.where(eq(DB.contractDeploymentsTable.id, verification.deploymentId))
		}
		if (mode !== 'no hash') {
			await db
				.update(DB.contractDeploymentsTable)
				.set({ transactionHash: Hex.toBytes(otherHash) })
				.where(eq(DB.contractDeploymentsTable.id, siblingId))
		}
		const before = await db.select().from(DB.contractDeploymentsTable)
		const response = await SELF.fetch(
			`https://test.local/v2/verify/${target.chainId}/${target.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...body,
					...(mode === 'no hash'
						? {}
						: { creationTransactionHash: transactionHash }),
				}),
			},
		)
		expect(response.status).toBe(409)
		expect(await response.json()).toMatchObject({
			customCode: 'already_verified',
		})
		expect(await db.select().from(DB.contractDeploymentsTable)).toEqual(before)
	})

	it('does not overwrite a completed source job when its alarm retries', async () => {
		const verification = await seedExact()
		const db = drizzle(env.CONTRACTS_DB)
		const [completed] = await db
			.select()
			.from(DB.verificationJobsTable)
			.where(eq(DB.verificationJobsTable.verifiedContractId, verification.id))
		if (!completed) throw new Error('Expected completed job')
		await runVerificationJob(
			env,
			{ ...target, ...body, jobId: completed.id },
			registry,
			{
				createPublicClient: () => ({
					getCode: async () => {
						throw new Error('Completed jobs must not fetch code')
					},
				}),
				getContainer: () => {
					throw new Error('Completed jobs must not compile')
				},
			},
		)
		const [retried] = await db
			.select()
			.from(DB.verificationJobsTable)
			.where(eq(DB.verificationJobsTable.id, completed.id))
		expect(retried).toEqual(completed)
	})

	it.each([
		false,
		true,
	])('counts distinct deployments rather than exact compilations (second deployment: %s)', async (secondDeployment) => {
		const verification = await seedExact()
		const db = drizzle(env.CONTRACTS_DB)
		const [compilation] = await db
			.select()
			.from(DB.compiledContractsTable)
			.where(eq(DB.compiledContractsTable.id, verification.compilationId))
		if (!compilation) throw new Error('Expected compilation')
		const compilationId = crypto.randomUUID()
		await db
			.insert(DB.compiledContractsTable)
			.values({ ...compilation, id: compilationId, version: '0.8.99' })
		const { id: _id, ...fields } = verification
		await db
			.insert(DB.verifiedContractsTable)
			.values({ ...fields, compilationId })
		if (secondDeployment) await duplicateExact(verification)
		const before = await sourceSnapshot()
		const deployments = await db.select().from(DB.contractDeploymentsTable)
		const response = await SELF.fetch(
			`https://test.local/v2/verify/${target.chainId}/${target.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...body,
					creationTransactionHash: transactionHash,
				}),
			},
		)
		expect(response.status).toBe(secondDeployment ? 409 : 202)
		if (secondDeployment) {
			expect(await response.json()).toMatchObject({
				customCode: 'ambiguous_creation_transaction',
			})
			expect((await repair())?.errorCode).toBe('ambiguous_creation_transaction')
			expect(await db.select().from(DB.contractDeploymentsTable)).toEqual(
				deployments,
			)
		} else {
			const accepted = (await response.json()) as { verificationId: string }
			const result = await repair(undefined, accepted.verificationId)
			expect(result?.errorCode).toBeNull()
			expect(result?.verifiedContractId).toBe(verification.id)
			expect(await db.select().from(DB.contractDeploymentsTable)).toHaveLength(
				1,
			)
		}
		expect(await sourceSnapshot()).toEqual(before)
	})

	it('retries the same completed job without changing sources or creating another deployment', async () => {
		const verification = await seedExact()
		const first = await repair()
		expect(first?.errorCode).toBeNull()
		if (!first) throw new Error('Expected repair job')
		const before = await sourceSnapshot()
		const retry = await repair(undefined, first.id)
		expect(retry?.errorCode).toBeNull()
		expect(retry?.verifiedContractId).toBe(verification.id)
		expect(await sourceSnapshot()).toEqual(before)
		expect(
			await drizzle(env.CONTRACTS_DB)
				.select()
				.from(DB.contractDeploymentsTable),
		).toHaveLength(1)
	})

	it('accepts concurrent identical proofs without duplicating source records', async () => {
		await seedExact()
		const before = await sourceSnapshot()
		const results = await Promise.all([repair(), repair()])
		expect(results.map((job) => job?.errorCode)).toEqual([null, null])
		expect(await sourceSnapshot()).toEqual(before)
		expect(
			await drizzle(env.CONTRACTS_DB)
				.select()
				.from(DB.contractDeploymentsTable),
		).toHaveLength(1)
	})

	it.each([
		['transaction hash', { transactionHash: Hex.toBytes(otherHash) }],
		['block', { blockNumber: 43 }],
		['index', { transactionIndex: 4 }],
		[
			'deployer',
			{ deployer: Hex.toBytes('0x3333333333333333333333333333333333333333') },
		],
	] as const)('refuses conflicting %s evidence without changing any fields', async (_name, fields) => {
		const verification = await seedExact()
		const db = drizzle(env.CONTRACTS_DB)
		await db
			.update(DB.contractDeploymentsTable)
			.set(fields)
			.where(eq(DB.contractDeploymentsTable.id, verification.deploymentId))
		const before = await db.select().from(DB.contractDeploymentsTable)
		const sources = await sourceSnapshot()
		expect((await repair())?.errorCode).toBe('creation_transaction_conflict')
		expect(await db.select().from(DB.contractDeploymentsTable)).toEqual(before)
		expect(await sourceSnapshot()).toEqual(sources)
	})

	it('does not overwrite conflicting metadata written while receipt validation is in flight', async () => {
		const verification = await seedExact()
		const db = drizzle(env.CONTRACTS_DB)
		const job = await repair(async () => {
			await db
				.update(DB.contractDeploymentsTable)
				.set({ transactionHash: Hex.toBytes(otherHash) })
				.where(eq(DB.contractDeploymentsTable.id, verification.deploymentId))
			return receipt
		})
		expect(job?.errorCode).toBe('creation_transaction_conflict')
		const [deployment] = await db.select().from(DB.contractDeploymentsTable)
		expect(
			Hex.fromBytes(new Uint8Array(deployment?.transactionHash as ArrayBuffer)),
		).toBe(otherHash)
		expect(deployment?.blockNumber).toBeNull()
	})

	it('updates only the deployment linked to the exact verification', async () => {
		const verification = await seedExact()
		const db = drizzle(env.CONTRACTS_DB)
		const [original] = await db.select().from(DB.contractDeploymentsTable)
		if (!original) throw new Error('Expected deployment')
		const siblingId = crypto.randomUUID()
		await db
			.insert(DB.contractDeploymentsTable)
			.values({ ...original, id: siblingId })
		expect((await repair())?.errorCode).toBeNull()
		const [sibling] = await db
			.select()
			.from(DB.contractDeploymentsTable)
			.where(eq(DB.contractDeploymentsTable.id, siblingId))
		expect(sibling).toEqual({ ...original, id: siblingId })
		const [repaired] = await db
			.select()
			.from(DB.contractDeploymentsTable)
			.where(eq(DB.contractDeploymentsTable.id, verification.deploymentId))
		expect(repaired?.transactionHash).not.toBeNull()
	})

	it('refuses ambiguous exact deployments without changing either one', async () => {
		const verification = await seedExact()
		const db = drizzle(env.CONTRACTS_DB)
		const [original] = await db.select().from(DB.contractDeploymentsTable)
		if (!original) throw new Error('Expected deployment')
		const siblingId = crypto.randomUUID()
		await db
			.insert(DB.contractDeploymentsTable)
			.values({ ...original, id: siblingId })
		const { id: _id, ...fields } = verification
		await db
			.insert(DB.verifiedContractsTable)
			.values({ ...fields, deploymentId: siblingId })
		const before = await db.select().from(DB.contractDeploymentsTable)
		const sources = await sourceSnapshot()
		const response = await SELF.fetch(
			`https://test.local/v2/verify/${target.chainId}/${target.address}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...body,
					creationTransactionHash: transactionHash,
				}),
			},
		)
		expect(response.status).toBe(409)
		expect((await repair())?.errorCode).toBe('ambiguous_creation_transaction')
		expect(await db.select().from(DB.contractDeploymentsTable)).toEqual(before)
		expect(await sourceSnapshot()).toEqual(sources)
	})

	it('keeps an invalid proof retryable and leaves the exact match unchanged', async () => {
		await seedExact()
		const before = await sourceSnapshot()
		const job = await repair(async () => {
			throw new Error('Receipt unavailable')
		})
		expect(job?.errorCode).toBe('invalid_creation_transaction')
		const [deployment] = await drizzle(env.CONTRACTS_DB)
			.select()
			.from(DB.contractDeploymentsTable)
		expect(deployment?.transactionHash).toBeNull()
		expect(await sourceSnapshot()).toEqual(before)
		expect((await repair())?.errorCode).toBeNull()
	})
})

async function duplicateExact(
	verification: Awaited<ReturnType<typeof seedExact>>,
) {
	const db = drizzle(env.CONTRACTS_DB)
	const [original] = await db
		.select()
		.from(DB.contractDeploymentsTable)
		.where(eq(DB.contractDeploymentsTable.id, verification.deploymentId))
	if (!original) throw new Error('Expected deployment')
	const siblingId = crypto.randomUUID()
	await db
		.insert(DB.contractDeploymentsTable)
		.values({ ...original, id: siblingId })
	const { id: _id, ...fields } = verification
	await db
		.insert(DB.verifiedContractsTable)
		.values({ ...fields, deploymentId: siblingId })
	return siblingId
}
