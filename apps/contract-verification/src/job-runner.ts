import { DurableObject } from 'cloudflare:workers'

import { getLogger } from '#lib/logger.ts'
import { formatError } from '#lib/utilities.ts'
import type { VerificationJob } from '#schema.ts'
import { runVerificationJob } from '#route.verify.ts'

const logger = getLogger(['tempo', 'job-runner'])

type LegacyStoredJob = Pick<
	VerificationJob,
	'jobId' | 'chainId' | 'address'
> & {
	body: Omit<VerificationJob, 'jobId' | 'chainId' | 'address'>
}

export class VerificationJobRunner extends DurableObject<Cloudflare.Env> {
	async enqueue(job: VerificationJob): Promise<void> {
		logger.info('job_enqueued', {
			jobId: job.jobId,
			chainId: job.chainId,
			address: job.address,
		})

		await this.ctx.storage.put('job', job)
		await this.ctx.storage.setAlarm(Date.now())
	}

	override async alarm(): Promise<void> {
		const storedJob = await this.ctx.storage.get<
			VerificationJob | LegacyStoredJob
		>('job')
		if (!storedJob) {
			logger.warn('alarm_job_missing')
			return
		}

		const job =
			'body' in storedJob
				? {
						jobId: storedJob.jobId,
						chainId: storedJob.chainId,
						address: storedJob.address,
						stdJsonInput: storedJob.body.stdJsonInput,
						compilerVersion: storedJob.body.compilerVersion,
						contractIdentifier: storedJob.body.contractIdentifier,
						creationTransactionHash: storedJob.body.creationTransactionHash,
					}
				: storedJob

		logger.info('job_started', {
			jobId: job.jobId,
			chainId: job.chainId,
			address: job.address,
		})

		try {
			await runVerificationJob(this.env, job)
			logger.info('job_finished', { jobId: job.jobId })
		} catch (error) {
			logger.error('job_alarm_error', {
				jobId: job.jobId,
				error: formatError(error),
			})
		}

		await this.ctx.storage.delete('job')
	}
}
