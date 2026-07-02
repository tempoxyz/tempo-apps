import type {
	PropagatorType,
	ProxyFn,
	RumInitConfiguration,
} from '@datadog/browser-rum-slim'

type DatadogRumImpl = typeof import('@datadog/browser-rum-slim')

const applicationId = '00000000-0000-0000-0000-000000000000'
const clientToken = 'explorer-dd-proxy'
const enabled = import.meta.env.VITE_DATADOG_ENABLED === 'true'
const env =
	import.meta.env.VITE_DATADOG_ENV ??
	import.meta.env.VITE_TEMPO_ENV ??
	import.meta.env.MODE
const proxyPath = '/dd-proxy'
const service = import.meta.env.VITE_DATADOG_SERVICE ?? 'explorer'
const tracingUrls = import.meta.env.VITE_DATADOG_ALLOWED_TRACING_URLS
const propagatorTypes: PropagatorType[] = ['tracecontext', 'datadog']

let impl: DatadogRumImpl | undefined
let initialized = false
let initPromise: Promise<void> | undefined

export function initDatadogRum(): Promise<void> {
	if (initPromise) return initPromise
	if (initialized || import.meta.env.DEV || typeof window === 'undefined') {
		return Promise.resolve()
	}
	if (!enabled) return Promise.resolve()

	initPromise = (async () => {
		impl = await import('@datadog/browser-rum-slim')
		impl.datadogRum.init({
			allowedTracingUrls: getAllowedTracingUrls(),
			applicationId,
			clientToken,
			defaultPrivacyLevel: 'mask-user-input',
			enablePrivacyForActionName: true,
			env,
			proxy,
			service,
			sessionReplaySampleRate: percent(
				import.meta.env.VITE_DATADOG_SESSION_REPLAY_SAMPLE_RATE,
				0,
			),
			sessionSampleRate: percent(
				import.meta.env.VITE_DATADOG_SESSION_SAMPLE_RATE,
				100,
			),
			traceContextInjection: 'sampled',
			traceSampleRate: percent(
				import.meta.env.VITE_DATADOG_TRACE_SAMPLE_RATE,
				20,
			),
			trackLongTasks: true,
			trackResources: true,
			trackUserInteractions: true,
			version: __BUILD_VERSION__,
		})
		impl.datadogRum.setGlobalContext({
			tempo_app_id: 'explorer',
			tempo_runtime: 'browser',
		})
		initialized = true
	})().catch((error) => {
		initPromise = undefined
		impl = undefined
		initialized = false
		throw error
	})

	return initPromise
}

function getAllowedTracingUrls(): RumInitConfiguration['allowedTracingUrls'] {
	const urls = (tracingUrls ?? '')
		.split(',')
		.map((url) => url.trim())
		.filter(Boolean)

	return [
		{ match: isApiUrl, propagatorTypes },
		...urls.map((match) => ({ match, propagatorTypes })),
	]
}

const proxy: ProxyFn = (options) => {
	const query = new URLSearchParams({
		ddforward: `${options.path}?${options.parameters}`,
	})
	if (options.subdomain) query.set('ddforwardSubdomain', options.subdomain)
	return `${proxyPath}?${query.toString()}`
}

function isApiUrl(input: string): boolean {
	try {
		const url = new URL(input, window.location.href)
		return (
			url.origin === window.location.origin &&
			(url.pathname === '/api' || url.pathname.startsWith('/api/'))
		)
	} catch {
		return false
	}
}

function percent(value: string | undefined, fallback: number): number {
	if (!value?.trim()) return fallback

	const n = Number.parseFloat(value)
	if (!Number.isFinite(n)) return fallback
	return Math.min(Math.max(n, 0), 100)
}
