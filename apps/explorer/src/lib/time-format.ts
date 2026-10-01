export type TimeFormat = 'relative' | 'local' | 'utc' | 'unix'

const storageKey = 'tempo-explorer-time-format'
const listeners = new Set<() => void>()
let timeFormat: TimeFormat | undefined

export function getServerTimeFormat(): TimeFormat {
	return 'relative'
}

export function getTimeFormat(): TimeFormat {
	if (typeof window === 'undefined') return getServerTimeFormat()
	if (timeFormat !== undefined) return timeFormat

	timeFormat = 'relative'
	try {
		const stored = window.localStorage.getItem(storageKey)
		if (
			stored === 'relative' ||
			stored === 'local' ||
			stored === 'utc' ||
			stored === 'unix'
		) {
			timeFormat = stored
		}
	} catch {
		// Storage can be unavailable; keep the preference in memory for this tab.
	}
	return timeFormat
}

export function subscribeTimeFormat(onChange: () => void): () => void {
	listeners.add(onChange)
	return () => {
		listeners.delete(onChange)
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
	} catch {
		// A failed write must not undo the user's selection or stop notifications.
	}
	if (timeFormat !== current) {
		for (const listener of [...listeners]) {
			if (listeners.has(listener)) listener()
		}
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
