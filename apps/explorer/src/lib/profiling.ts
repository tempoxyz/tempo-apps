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
			while (eventQueue.length > 0) {
				const event = eventQueue.shift()!
				window.posthog.capture(event.name, event.properties)
			}
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
	PAGE_HYDRATION: 'page_hydration',
	PAGE_FIRST_DRAW: 'page_first_draw',
	API_LATENCY: 'api_latency',
} as const

/**
 * Normalize a path to a route pattern for grouping.
 * e.g., /tx/0x123... → /tx/:hash
 */
export function normalizePathPattern(path: string): string {
	return path
		.replace(/\/0x[a-fA-F0-9]+/g, '/:hash')
		.replace(/\/\d+/g, '/:id')
}
