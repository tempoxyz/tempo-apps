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

/**
 * Safely capture an event to PostHog.
 * Drops events silently if PostHog hasn't loaded (avoids unbounded queue/polling).
 */
export function captureEvent(
	name: string,
	properties: Record<string, unknown> = {},
) {
	if (typeof window === 'undefined') return
	if (!window.posthog?.capture) return

	window.posthog.capture(name, { ...properties, timestamp: Date.now() })
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
	API_LATENCY: 'explorer.profiling.api_latency',
	LOADER_DURATION: 'explorer.profiling.loader_duration',
	TTFB: 'explorer.profiling.ttfb',
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
