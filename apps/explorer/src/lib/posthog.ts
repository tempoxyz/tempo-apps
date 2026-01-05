import { env } from 'cloudflare:workers'
import { PostHog } from 'posthog-node'

export function createPostHogClient(
	options = {
		apiKey: env.VITE_POSTHOG_KEY,
		host: env.VITE_POSTHOG_HOST,
	},
) {
	const posthog = new PostHog(options.apiKey, {
		host: options.host,
		flushAt: 1, // Send events immediately in edge environment
		flushInterval: 0, // Don't wait for interval
	})
	return posthog
}
