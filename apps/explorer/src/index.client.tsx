/** biome-ignore-all assist/source/organizeImports: _ */
import posthog from 'posthog-js'
import { PostHogProvider } from '@posthog/react'
import { StartClient } from '@tanstack/react-start/client'
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'

posthog.init(
	'phc_aNlTw2xAUQKd9zTovXeYheEUpQpEhplehCK5r1e31HR',
	{
		api_host: '/api/ph',
		defaults: '2025-11-30',
	},
	'explorer',
)

hydrateRoot(
	document,
	<React.StrictMode>
		<PostHogProvider client={posthog}>
			<StartClient />
		</PostHogProvider>
	</React.StrictMode>,
)
