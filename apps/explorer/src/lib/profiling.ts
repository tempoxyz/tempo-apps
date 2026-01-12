type PostHogEvent = {
	name: string
	properties: Record<string, unknown>
}

declare global {
	interface Window {
		posthog?: {
			capture: (event: string, properties?: Record<string, unknown>) => void
		}
	}
}

const eventQueue: PostHogEvent[] = []
let isProcessingQueue = false

/**
 * Safely capture an event to PostHog.
 * Queues events if PostHog hasn't loaded yet.
 */
export function captureEvent(
	name: string,
	properties: Record<string, unknown> = {},
) {
	if (typeof window === 'undefined') return

	const event = { name, properties: { ...properties, timestamp: Date.now() } }

	if (window.posthog?.capture) {
		window.posthog.capture(event.name, event.properties)
	} else {
		eventQueue.push(event)
		processQueue()
	}
}

function processQueue() {
	if (isProcessingQueue) return
	isProcessingQueue = true

	const checkAndProcess = () => {
		if (window.posthog?.capture && eventQueue.length > 0) {
			for (const event of eventQueue) {
				window.posthog.capture(event.name, event.properties)
			}
			eventQueue.length = 0
			isProcessingQueue = false
		} else if (eventQueue.length > 0) {
			setTimeout(checkAndProcess, 100)
		} else {
			isProcessingQueue = false
		}
	}

	checkAndProcess()
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

/**
 * Wrap a loader function to measure its execution time.
 * Returns the original data plus `__loaderTiming` metadata.
 */
export async function withLoaderTiming<T>(
	routeId: string,
	loaderFn: () => Promise<T>,
): Promise<T & { __loaderTiming: { duration_ms: number; route_id: string } }> {
	const start = Date.now()
	const data = await loaderFn()
	const duration = Date.now() - start

	return {
		...data,
		__loaderTiming: {
			duration_ms: duration,
			route_id: routeId,
		},
	}
}
