export type TimeFormat = 'relative' | 'local' | 'utc' | 'unix'

const storageKey = 'tempo-explorer-time-format'
const listeners = new Set<() => void>()
let timeFormat: TimeFormat | undefined
let persistedTimeFormat: TimeFormat | undefined
let hasUnpersistedSelection = false

export function getServerTimeFormat(): TimeFormat {
	return 'relative'
}

function readPersistedTimeFormat(): TimeFormat | undefined {
	try {
		const stored = window.localStorage.getItem(storageKey)
		if (
			stored === 'relative' ||
			stored === 'local' ||
			stored === 'utc' ||
			stored === 'unix'
		) {
			return stored
		}
		return 'relative'
	} catch {
		// Storage can be unavailable; keep the preference in memory for this tab.
		return undefined
	}
}

export function getTimeFormat(): TimeFormat {
	if (typeof window === 'undefined') return getServerTimeFormat()
	if (timeFormat !== undefined) return timeFormat

	persistedTimeFormat = readPersistedTimeFormat()
	timeFormat = persistedTimeFormat ?? 'relative'
	return timeFormat
}

function notify(): void {
	for (const listener of [...listeners]) {
		if (listeners.has(listener)) listener()
	}
}

function reconcilePersistedTimeFormat(): void {
	const stored = readPersistedTimeFormat()
	// An unchanged stored value must not undo an in-memory choice whose write failed.
	if (stored === undefined || stored === persistedTimeFormat) return
	if (persistedTimeFormat === undefined && hasUnpersistedSelection) {
		// Storage has recovered, but this is our first known baseline, not a new choice.
		persistedTimeFormat = stored
		return
	}
	persistedTimeFormat = stored
	hasUnpersistedSelection = false
	if (timeFormat !== stored) {
		timeFormat = stored
		notify()
	}
}

function handlePageShow(event: PageTransitionEvent): void {
	if (event.persisted) reconcilePersistedTimeFormat()
}

export function subscribeTimeFormat(onChange: () => void): () => void {
	if (typeof window === 'undefined') return () => {}
	const browser = window
	const listener = () => onChange()
	getTimeFormat()
	if (listeners.size === 0) {
		browser.addEventListener('pageshow', handlePageShow)
		// Also reconcile a restored document that had no mounted timestamp controls.
		reconcilePersistedTimeFormat()
	}
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
		if (listeners.size === 0) {
			browser.removeEventListener('pageshow', handlePageShow)
		}
	}
}

export function setTimeFormat(
	next: TimeFormat | ((current: TimeFormat) => TimeFormat),
): void {
	if (typeof window === 'undefined') return
	const current = getTimeFormat()
	timeFormat = typeof next === 'function' ? next(current) : next
	try {
		window.localStorage.setItem(storageKey, timeFormat)
		persistedTimeFormat = timeFormat
		hasUnpersistedSelection = false
	} catch {
		// A failed write must not undo the user's selection or stop notifications.
		hasUnpersistedSelection = true
	}
	if (timeFormat !== current) {
		notify()
	}
}

export function cycleTimeFormat(): void {
	setTimeFormat((current) => {
		if (current === 'relative') return 'local'
		if (current === 'local') return 'utc'
		if (current === 'utc') return 'unix'
		return 'relative'
	})
}
