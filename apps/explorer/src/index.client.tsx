import { StartClient } from '@tanstack/react-start/client'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { initPostHog } from '#lib/posthog'

// PostHog page views. The key and host are compiled in at build time from
// VITE_EXPLORER_POSTHOG_KEY and VITE_POSTHOG_HOST. Without them, or on a
// non-Tempo host, the page loads nothing PostHog related.
initPostHog({
	key: import.meta.env.VITE_EXPLORER_POSTHOG_KEY,
	host: import.meta.env.VITE_POSTHOG_HOST,
})

hydrateRoot(
	document,
	<React.StrictMode>
		<StartClient />
	</React.StrictMode>,
)
