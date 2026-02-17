declare global {
	interface Window {
		posthog?: {
			capture: (event: string, properties?: Record<string, unknown>) => void
		}
	}
}

let navigationId = 0

export function nextNavigationId(): number {
	return ++navigationId
}

export function getNavigationId(): number {
	return navigationId
}

let timingCounter = 0

function nextTimingId(): string {
	return `t-${++timingCounter}-${Date.now()}`
}

const SAMPLE_RATE = 0.25

function shouldSample(): boolean {
	return Math.random() < SAMPLE_RATE
}

const MAX_BUFFER_SIZE = 20
const FLUSH_INTERVAL_MS = 250
const FLUSH_MAX_WAIT_MS = 10_000

type BufferedEvent = { name: string; properties: Record<string, unknown> }
let eventBuffer: Array<BufferedEvent> = []
let flushTimer: ReturnType<typeof setInterval> | undefined

function startFlushLoop() {
	if (flushTimer !== undefined) return
	const start = Date.now()
	flushTimer = setInterval(() => {
		if (window.posthog?.capture) {
			for (const evt of eventBuffer) {
				window.posthog.capture(evt.name, evt.properties)
			}
			eventBuffer = []
			clearInterval(flushTimer)
			flushTimer = undefined
		} else if (Date.now() - start > FLUSH_MAX_WAIT_MS) {
			eventBuffer = []
			clearInterval(flushTimer)
			flushTimer = undefined
		}
	}, FLUSH_INTERVAL_MS)
}

/**
 * Safely capture an event to PostHog.
 * Buffers up to 20 events if PostHog hasn't loaded yet and flushes once available.
 */
export function captureEvent(
	name: string,
	properties: Record<string, unknown> = {},
) {
	if (typeof window === 'undefined') return

	const props = { ...properties, timestamp: Date.now() }

	if (window.posthog?.capture) {
		window.posthog.capture(name, props)
		return
	}

	if (eventBuffer.length < MAX_BUFFER_SIZE) {
		eventBuffer.push({ name, properties: props })
		startFlushLoop()
	}
}

/**
 * Capture a sampled event — only a fraction of calls actually emit.
 * Use for high-volume events like API_LATENCY.
 */
export function captureSampledEvent(
	name: string,
	properties: Record<string, unknown> = {},
) {
	if (!shouldSample()) return
	captureEvent(name, { ...properties, sample_rate: SAMPLE_RATE })
}

export const ProfileEvents = {
	PAGE_FIRST_DRAW: 'explorer.profiling.page_first_draw',
	PAGE_LOAD: 'explorer.profiling.page_load',
	API_LATENCY: 'explorer.profiling.api_latency',
	LOADER_DURATION: 'explorer.profiling.loader_duration',
	TTFB: 'explorer.profiling.ttfb',
	ERROR: 'explorer.error',
	APP_BOOT: 'explorer.availability.app_boot',
} as const

/**
 * Normalize a path to a route pattern for grouping.
 * e.g., /tx/0x123... → /tx/:hash
 */
export function normalizePathPattern(path: string): string {
	return path.replace(/\/0x[a-fA-F0-9]+/g, '/:hash').replace(/\/\d+/g, '/:id')
}

export type LoaderTiming = {
	duration_ms: number
	route_id: string
	timing_id: string
	status: 'success' | 'error'
	error_message?: string | undefined
}

/**
 * Wrap a loader function to measure its execution time.
 * Uses performance.now() for monotonic, high-resolution timing.
 * Captures both success and error durations.
 */
export async function withLoaderTiming<T>(
	routeId: string,
	loaderFn: () => Promise<T>,
): Promise<T & { __loaderTiming: LoaderTiming }> {
	const start = performance.now()
	let status: 'success' | 'error' = 'success'
	let errorMessage: string | undefined

	try {
		const data = await loaderFn()
		return {
			...data,
			__loaderTiming: {
				duration_ms: Math.round(performance.now() - start),
				route_id: routeId,
				timing_id: nextTimingId(),
				status,
			},
		}
	} catch (error) {
		status = 'error'
		errorMessage = error instanceof Error ? error.message : String(error)

		throw Object.assign(error as Error, {
			__loaderTiming: {
				duration_ms: Math.round(performance.now() - start),
				route_id: routeId,
				timing_id: nextTimingId(),
				status,
				error_message: errorMessage,
			} satisfies LoaderTiming,
		})
	}
}
