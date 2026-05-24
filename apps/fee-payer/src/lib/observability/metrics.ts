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

function getFeePayerEnvironment(): 'mainnet' | 'testnet' {
	return env.TEMPO_ENV === 'mainnet' ? 'mainnet' : 'testnet'
}

function metricsEnabled(): boolean {
	return process.env.NODE_ENV !== 'test'
}

function getBuildVersion(): string {
	return typeof __BUILD_VERSION__ === 'string' ? __BUILD_VERSION__ : 'dev'
}

function createFeePayerMetrics(): FeePayerMetrics {
	if (!metricsEnabled()) return noop

	const instance = createMetrics<MetricRegistry>({
		globalTags: {
			build_version: getBuildVersion(),
			fee_payer_env: getFeePayerEnvironment(),
		},
	})

	return {
		count(name, value, tags) {
			instance.count(name, value, tags)
			instance.flush()
		},
		histogram(name, value, tags) {
			instance.histogram(name, value, tags)
			instance.flush()
		},
		flush() {
			instance.flush()
		},
	}
}

export const metrics = createFeePayerMetrics()
