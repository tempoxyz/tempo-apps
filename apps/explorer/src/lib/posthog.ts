import { env } from 'cloudflare:workers'
import { createServerOnlyFn } from '@tanstack/react-start'
import { PostHog } from 'posthog-node'

export const posthogClient = createServerOnlyFn(
	(
		options = {
			apiKey: env.VITE_POSTHOG_KEY,
			host: env.VITE_POSTHOG_HOST,
		},
	) => {
		return new PostHog(options.apiKey, {
			host: options.host,
			flushAt: 1, // Send events immediately in edge environment
			flushInterval: 0, // Don't wait for interval
		})
	},
)
