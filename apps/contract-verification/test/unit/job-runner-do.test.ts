import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:workers'
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { Hex } from 'ox'
import { describe, expect, it } from 'vitest'

import * as DB from '#database/schema.ts'
import type { VerificationJobRunner } from '#job-runner.ts'
import type { VerificationJob } from '#schema.ts'
import { counterFixture } from '../fixtures/counter.fixture.ts'

function makeJob(jobId: string): VerificationJob {
	return {
		jobId,
		chainId: counterFixture.chainId,
		address: counterFixture.address,
		stdJsonInput: counterFixture.stdJsonInput,
		compilerVersion: counterFixture.compilerVersion,
		contractIdentifier: counterFixture.contractIdentifier,
	}
}

async function insertJobRow(jobId: string) {
	const db = drizzle(env.CONTRACTS_DB)
	await db.insert(DB.verificationJobsTable).values({
		id: jobId,
		chainId: counterFixture.chainId,
		contractAddress: Hex.toBytes(counterFixture.address),
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

function getStub(name: string) {
	const id = env.VERIFICATION_JOB_RUNNER.idFromName(name)
	return env.VERIFICATION_JOB_RUNNER.get(
		id,
	) as DurableObjectStub<VerificationJobRunner>
}

describe('VerificationJobRunner Durable Object', () => {
	describe('alarm – missing job', () => {
		it('returns early without error when storage has no job', async () => {
			const stub = getStub('missing-job-test')

			await runInDurableObject(stub, async (_instance, state) => {
				await state.storage.setAlarm(Date.now() + 60_000)
			})

			const ran = await runDurableObjectAlarm(stub)
			expect(ran).toBe(true)

			const hasJob = await runInDurableObject(
				stub,
				async (_instance, state) => await state.storage.get('job'),
			)
			expect(hasJob).toBeUndefined()
		})
	})

	describe('enqueue + alarm – success path', () => {
		it('stores the job and schedules an alarm via enqueue', async () => {
			const jobId = globalThis.crypto.randomUUID()
			await insertJobRow(jobId)

			const stub = getStub(jobId)
			const job = makeJob(jobId)

			await runInDurableObject(stub, async (_instance, state) => {
				await state.storage.put('job', job)
				await state.storage.setAlarm(Date.now() + 60_000)
			})

			const storedJob = await runInDurableObject(
				stub,
				async (_instance, state) =>
					await state.storage.get<VerificationJob>('job'),
			)
			expect(storedJob).toBeDefined()
			expect(storedJob?.jobId).toBe(jobId)

			const ran = await runDurableObjectAlarm(stub)
			expect(ran).toBe(true)

			const jobAfterAlarm = await runInDurableObject(
				stub,
				async (_instance, state) => await state.storage.get('job'),
			)
			expect(jobAfterAlarm).toBeUndefined()

			const row = await getJobRow(jobId)
			expect(row).not.toBeNull()
			expect(row?.completedAt).not.toBeNull()
		})

		it('enqueue() stores job and sets alarm; manually firing alarm completes the job', async () => {
			const jobId = globalThis.crypto.randomUUID()
			await insertJobRow(jobId)

			const stub = getStub(jobId)
			await stub.enqueue(makeJob(jobId))

			const jobInStorage = await runInDurableObject(
				stub,
				async (_instance, state) => await state.storage.get('job'),
			)
			expect(jobInStorage).toBeDefined()

			await runInDurableObject(stub, async (instance) => {
				await instance.alarm()
			})

			const jobAfter = await runInDurableObject(
				stub,
				async (_instance, state) => await state.storage.get('job'),
			)
			expect(jobAfter).toBeUndefined()

			const row = await getJobRow(jobId)
			expect(row).not.toBeNull()
			expect(row?.completedAt).not.toBeNull()
		})
	})

	describe('alarm – failure with cleanup', () => {
		it('deletes the job from DO storage even when runVerificationJob encounters an error', async () => {
			const jobId = globalThis.crypto.randomUUID()
			await insertJobRow(jobId)

			const stub = getStub(jobId)
			const job = makeJob(jobId)

			await runInDurableObject(stub, async (_instance, state) => {
				await state.storage.put('job', job)
				await state.storage.setAlarm(Date.now() + 60_000)
			})

			const before = await runInDurableObject(
				stub,
				async (_instance, state) => await state.storage.get('job'),
			)
			expect(before).toBeDefined()

			const ran = await runDurableObjectAlarm(stub)
			expect(ran).toBe(true)

			const after = await runInDurableObject(
				stub,
				async (_instance, state) => await state.storage.get('job'),
			)
			expect(after).toBeUndefined()
		})

		it('records an error in the DB row when the job has an invalid chainId', async () => {
			const jobId = globalThis.crypto.randomUUID()
			await insertJobRow(jobId)

			const stub = getStub(jobId)
			await runInDurableObject(stub, async (_instance, state) => {
				await state.storage.put('job', {
					...makeJob(jobId),
					chainId: 999_999,
				})
				await state.storage.setAlarm(Date.now() + 60_000)
			})

			await runDurableObjectAlarm(stub)

			const row = await getJobRow(jobId)
			expect(row).not.toBeNull()
			expect(row?.completedAt).not.toBeNull()
			expect(row?.errorCode).toBe('internal_error')
		})

		it('does not leave a dangling alarm after processing', async () => {
			const jobId = globalThis.crypto.randomUUID()
			await insertJobRow(jobId)

			const stub = getStub(jobId)
			await runInDurableObject(stub, async (_instance, state) => {
				await state.storage.put('job', makeJob(jobId))
				await state.storage.setAlarm(Date.now() + 60_000)
			})

			await runDurableObjectAlarm(stub)

			const alarmAfter = await runInDurableObject(
				stub,
				async (_instance, state) => await state.storage.getAlarm(),
			)
			expect(alarmAfter).toBeNull()

			const ranAgain = await runDurableObjectAlarm(stub)
			expect(ranAgain).toBe(false)
		})
	})
})
