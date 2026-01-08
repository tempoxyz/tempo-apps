import { StartClient } from '@tanstack/react-start/client'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import {
	captureEvent,
	normalizePathPattern,
	ProfileEvents,
} from '#lib/profiling'

performance.mark('hydration-start')

hydrateRoot(
	document,
	<React.StrictMode>
		<StartClient />
	</React.StrictMode>,
)

requestIdleCallback(() => {
	performance.mark('hydration-end')
	performance.measure('hydration', 'hydration-start', 'hydration-end')

	const measure = performance.getEntriesByName('hydration', 'measure')[0]
	if (measure) {
		captureEvent(ProfileEvents.PAGE_HYDRATION, {
			duration_ms: Math.round(measure.duration),
			path: window.location.pathname,
			route_pattern: normalizePathPattern(window.location.pathname),
		})
	}
})
