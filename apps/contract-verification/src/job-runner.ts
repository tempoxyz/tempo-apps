import { DurableObject } from 'cloudflare:workers'

import { getLogger } from '#lib/logger.ts'
import { formatError } from '#lib/utilities.ts'
import { runVerificationJob } from '#route.verify.ts'
import { staticChains } from '#wagmi.config.ts'
import { ChainRegistry, resolveAuthToken } from '#lib/chain-registry.ts'
import type { VerificationJob } from '#schema.ts'

const logger = getLogger(['tempo', 'job-runner'])

/** Shape of jobs stored by deployments that nested the verification input under `body`. */
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

		// Unpack jobs enqueued before the flat VerificationJob shape so
		// in-flight Durable Object alarms survive a deploy.
		const job: VerificationJob =
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
			const authToken = await resolveAuthToken(
				this.env.CHAINS_CONFIG_AUTH_TOKEN,
			)
			const url = this.env.CHAINS_CONFIG_URL || undefined
			const registry = url
				? await ChainRegistry.fromUrl({ url, authToken, staticChains })
				: ChainRegistry.fromStatic(staticChains)

			await runVerificationJob(this.env, job, registry)
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
