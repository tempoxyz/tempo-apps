import { env } from 'cloudflare:workers'
import { createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'
import posthog from 'posthog-js'
import { PostHog } from 'posthog-node'

export const serverSidePosthog = createServerOnlyFn(
	() =>
		new PostHog(env.VITE_POSTHOG_HOST, {
			host: env.VITE_POSTHOG_HOST,
			flushAt: 1, // Send events immediately in edge environment
			flushInterval: 0, // Don't wait for interval
		}),
)

export const clientSidePosthog = createIsomorphicFn().client(() =>
	posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
		api_host: '/api/ph',
	}),
)
