import { env } from 'cloudflare:workers'
import { createMetrics } from 'cloudflare-worker-metrics'
import type { MetricRegistry } from './metric-registry.js'

type FeePayerMetrics = Pick<
	ReturnType<typeof createMetrics<MetricRegistry>>,
	'count' | 'histogram' | 'flush'
>

const noop: FeePayerMetrics = {
	count() {},
	histogram() {},
	flush() {},
}

function metricsEnabled(): boolean {
	return process.env.NODE_ENV !== 'test'
}

function getBuildVersion(): string {
	return typeof __BUILD_VERSION__ === 'string' ? __BUILD_VERSION__ : 'dev'
}

function getTempoEnvironment(): string {
	return env.TEMPO_ENV
}

function createFeePayerMetrics(): FeePayerMetrics {
	if (!metricsEnabled()) return noop

	const instance = createMetrics<MetricRegistry>({
		globalTags: {
			build_version: getBuildVersion(),
			env: getTempoEnvironment(),
			service: 'fee-payer',
			tempo_env: getTempoEnvironment(),
			version: getBuildVersion(),
		},
	})

	return {
		count(name, value, tags) {
			instance.count(name, value, tags)
		},
		histogram(name, value, tags) {
			instance.histogram(name, value, tags)
		},
		flush() {
			instance.flush()
		},
	}
}

export const metrics = createFeePayerMetrics()
