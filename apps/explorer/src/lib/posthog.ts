import { env } from 'cloudflare:workers'
import { PostHog } from 'posthog-node'

export function createPostHogClient(
	options?:
		| {
				apiKey: string
				host: string
		  }
		| undefined,
) {
	const apiKey = options?.apiKey ?? env.VITE_POSTHOG_API_KEY
	const host = options?.host ?? env.VITE_POSTHOG_HOST

	const posthog = new PostHog(apiKey, {
		host,
		flushAt: 1, // Send events immediately in edge environment
		flushInterval: 0, // Don't wait for interval
	})
	return posthog
}
