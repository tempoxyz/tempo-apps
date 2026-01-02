import { PostHogProvider } from '@posthog/react'
import { StartClient } from '@tanstack/react-start/client'
import posthog from 'posthog-js'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
	api_host: 'https://o11y.tempo.xyz',
	defaults: '2025-11-30',
})

hydrateRoot(
	document,
	<React.StrictMode>
		<PostHogProvider client={posthog}>
			<StartClient />
		</PostHogProvider>
	</React.StrictMode>,
)
