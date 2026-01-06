import { waitUntil } from 'cloudflare:workers'
import {
	createStartHandler,
	defaultStreamHandler,
	defineHandlerCallback,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

import { serverSidePosthog } from '#lib/posthog.ts'

const redirects: Array<{
	from: RegExp
	to: (match: RegExpMatchArray) => string
}> = [
	{ from: /^\/blocks\/(latest|\d+)$/, to: (m) => `/block/${m[1]}` },
	{ from: /^\/transaction\/(.+)$/, to: (m) => `/tx/${m[1]}` },
	{ from: /^\/tokens\/(.+)$/, to: (m) => `/token/${m[1]}` },
]

const entryHandler = defineHandlerCallback((context) => {
	const url = new URL(context.request.url)

	for (const { from, to } of redirects) {
		const match = url.pathname.match(from)
		if (!match) continue
		url.pathname = to(match)
		return Response.redirect(url, 301)
	}
	return defaultStreamHandler(context)
})

const startFetch = createStartHandler(entryHandler)

export default createServerEntry({
	fetch: async (request, options) => {
		if (!options) return startFetch(request, options)

		const posthog = serverSidePosthog()
		const distinctId = 'explorer@tempo.xyz' // TODO: ~~temp~~ - remove me

		waitUntil(
			posthog.captureImmediate({
				distinctId,
				event: '_explorer_test_event',
				properties: {
					$current_url: request.url,
				},
			}),
		)

		waitUntil(posthog.shutdown())

		return startFetch(request, options)
	},
})
