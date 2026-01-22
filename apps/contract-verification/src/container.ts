import { Container, type StopParams } from '@cloudflare/containers'
import { log } from '#utilities.ts'

export class VerificationContainer extends Container<Cloudflare.Env> {
	defaultPort = 8080
	sleepAfter = '10m'
	enableInternet = true

	override async onStart(): Promise<void> {
		const response = await this.containerFetch('http://localhost:8080/health')
		if (!response.ok) throw new Error('Container health check failed')

		const data = await response.text()
		log.info('container_started', { healthResponse: data })
	}

	override onStop(stopParams: StopParams): void {
		if (stopParams.exitCode === 0) {
			log.info('container_stopped', { exitCode: 0, reason: stopParams.reason })
		} else {
			log.warn('container_stopped_unexpectedly', {
				exitCode: stopParams.exitCode,
				reason: stopParams.reason,
			})
		}
	}

	override onError(error: unknown): unknown {
		const errorMeta = extractErrorMeta(error)
		log.error('container_error', error, errorMeta)
		throw error
	}

	override async alarm(alarmProps: {
		isRetry: boolean
		retryCount: number
	}): Promise<void> {
		try {
			await super.alarm(alarmProps)
		} catch (error) {
			const errorMeta = extractErrorMeta(error)
			log.error('container_alarm_error', error, {
				...errorMeta,
				isRetry: alarmProps.isRetry,
				retryCount: alarmProps.retryCount,
			})
			throw error
		}
	}
}

function extractErrorMeta(error: unknown): Record<string, unknown> {
	if (error && typeof error === 'object') {
		const e = error as Record<string, unknown>
		return {
			remote: e.remote,
			retryable: e.retryable,
			overloaded: e.overloaded,
		}
	}
	return {}
}
