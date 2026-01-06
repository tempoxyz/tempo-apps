import { createIsomorphicFn, createServerOnlyFn } from '@tanstack/react-start'
import posthog from 'posthog-js'
import { PostHog } from 'posthog-node'

export const serverSidePosthog = createServerOnlyFn(
	() =>
		new PostHog('phc_aNlTw2xAUQKd9zTovXeYheEUpQpEhplehCK5r1e31HR', {
			host: 'https://us.i.posthog.com',
			flushAt: 1, // Send events immediately in edge environment
			flushInterval: 0, // Don't wait for interval
		}),
)

export const clientSidePosthog = createIsomorphicFn().client(() =>
	posthog.init('phc_aNlTw2xAUQKd9zTovXeYheEUpQpEhplehCK5r1e31HR', {
		api_host: '/api/ph',
	}),
)
