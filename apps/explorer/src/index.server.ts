import { env } from 'cloudflare:workers'
import type { ExecutionContext } from '@cloudflare/workers-types'
// import { BaseContext } from '@tanstack/react-start'
import handler, {
	createServerEntry,
	type ServerEntry,
} from '@tanstack/react-start/server-entry'
import { createPostHogClient } from '#lib/posthog.ts'

type BaseContext = NonNullable<Parameters<ServerEntry['fetch']>[1]>['context']

export const redirects: Array<{
	from: RegExp
	to: (match: RegExpMatchArray) => string
}> = [
	{ from: /^\/blocks\/(latest|\d+)$/, to: (m) => `/block/${m[1]}` },
	{ from: /^\/transaction\/(.+)$/, to: (m) => `/tx/${m[1]}` },
	{ from: /^\/tokens\/(.+)$/, to: (m) => `/token/${m[1]}` },
]

export default createServerEntry({
	// @ts-expect-error - opts is not typed correctly
  fetch: async (
		request,
		opts: { context?: BaseContext & ExecutionContext },
	) => {
		const url = new URL(request.url)

		for (const { from, to } of redirects) {
			const match = url.pathname.match(from)
			if (match) {
				url.pathname = to(match)
				return Response.redirect(url, 301)
			}
		}

		const posthog = createPostHogClient({
			apiKey: env.VITE_POSTHOG_API_KEY,
			host: env.VITE_POSTHOG_HOST,
		})
		const distinctId = 'ian@posthog.com' // replace with actual user ID

		opts?.context?.waitUntil(
			posthog.captureImmediate({
				distinctId: distinctId,
				event: 'hello_world_request',
				properties: {
					$current_url: request.url,
				},
			}),
		)

		const flag = await posthog.isFeatureEnabled('test_flag', distinctId)
		console.info('flag', flag || false)

		opts?.context?.waitUntil(posthog.shutdown())

		return handler.fetch(request, opts)
	},
})
