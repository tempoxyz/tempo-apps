import { DurableObject } from 'cloudflare:workers'

import { getLogger } from '#lib/logger.ts'
import { formatError } from '#lib/utilities.ts'
import { runVerificationJob } from '#route.verify.ts'
import { staticChains } from '#wagmi.config.ts'
import { ChainRegistry, resolveAuthToken } from '#lib/chain-registry.ts'

const logger = getLogger(['tempo', 'job-runner'])

type StoredJob = {
	jobId: string
	chainId: number
	address: string
	body: {
		stdJsonInput: {
			language: string
			sources: Record<string, { content: string }>
			settings: object
		}
		compilerVersion: string
		contractIdentifier: string
		creationTransactionHash?: string
	}
}

export class VerificationJobRunner extends DurableObject<Cloudflare.Env> {
	async enqueue(job: StoredJob): Promise<void> {
		logger.info('job_enqueued', {
			jobId: job.jobId,
			chainId: job.chainId,
			address: job.address,
		})

		await this.ctx.storage.put('job', job)
		await this.ctx.storage.setAlarm(Date.now())
	}

	override async alarm(): Promise<void> {
		const job = await this.ctx.storage.get<StoredJob>('job')
		if (!job) {
			logger.warn('alarm_job_missing')
			return
		}

		logger.info('job_started', {
			jobId: job.jobId,
			chainId: job.chainId,
			address: job.address,
		})

		try {
			const authToken = await resolveAuthToken(
				this.env.CHAINS_CONFIG_AUTH_TOKEN_SECRET ||
					this.env.CHAINS_CONFIG_AUTH_TOKEN,
			)
			const url = this.env.CHAINS_CONFIG_URL || undefined
			const registry = url
				? await ChainRegistry.fromUrl({ url, authToken, staticChains })
				: ChainRegistry.fromStatic(staticChains)

			await runVerificationJob(
				this.env,
				job.jobId,
				job.chainId,
				job.address,
				job.body,
				registry,
			)
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
