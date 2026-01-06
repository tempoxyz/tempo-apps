/** biome-ignore-all assist/source/organizeImports: _ */
import { isomorphicPosthog } from '#lib/posthog.ts'

import {
	createStartHandler,
	defaultStreamHandler,
	defineHandlerCallback,
} from '@tanstack/react-start/server'
import { waitUntil } from 'cloudflare:workers'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const entryHandler = defineHandlerCallback(async (context) => {
	const url = new URL(context.request.url)

	// We do this so that transactions are grouped under the route ID instead of unique URLs
	const matches = context.router.state.matches ?? []
	const leaf = matches[matches.length - 1]
	const routeId = leaf.routeId ?? url.pathname

	const posthog = isomorphicPosthog()
	if (!posthog) return defaultStreamHandler(context)

	waitUntil(
		posthog?.captureImmediate({
			distinctId: routeId,
			event: 'server_request',
			properties: {
				'route.id': routeId,
				'http.path': url.pathname,
				'http.method': context.request.method,
				'http.full_url': url.toString(),
			},
		}),
	)

	waitUntil(posthog.shutdown())

	return defaultStreamHandler(context)
})

export default createServerEntry({
	fetch: async (request, options) => {
		const handler = createStartHandler(entryHandler)

		return handler(request, options)
	},
})
