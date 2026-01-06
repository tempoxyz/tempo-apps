import { waitUntil } from 'cloudflare:workers'
import { usePostHog } from '@posthog/react'
import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import * as z from 'zod/mini'
import { posthogClient } from '#lib/posthog.ts'

export const Route = createFileRoute('/_layout/debug')({
	validateSearch: z.object({
		query: z.prefault(z.string(), 'foo'),
	}),
	component: RouteComponent,
	loaderDeps: ({ search: { query, plain } }) => ({ query, plain }),
	server: {
		handlers: {
			GET: async ({ request, next }) => {
				const url = new URL(request.url)
				const query = url.searchParams.get('query')
				const plain = url.searchParams.get('plain')

				const posthog = posthogClient()

				waitUntil(
					posthog?.captureImmediate({
						event: '_explorer_test_event',
						distinctId: 'explorer@tempo.xyz',
						properties: { query, plain },
					}),
				)

				waitUntil(posthog.shutdown())

				return next()
			},
		},
	},
})

function RouteComponent() {
	const search = Route.useSearch()
	const posthog = usePostHog()

	React.useEffect(() => {
		posthog?.identify('user_id', {
			url: window.location.href,
			query: search.query,
			timestamp: new Date(),
		})
		posthog?.capture('_explorer_test_event', {
			url: window.location.href,
			query: search.query,
			timestamp: new Date(),
		})
	}, [search, posthog])

	return (
		<main className="flex flex-col items-center justify-center h-screen">
			<pre>{JSON.stringify(search, undefined, 2)}</pre>
			<button
				type="button"
				className="cursor-pointer bg-accent text-white m-2 p-1"
				onClick={() => {
					const result = posthog?.capture('button_clicked', {
						query: search.query,
						timestamp: new Date(),
						cta_name: 're-capture event',
					})
					console.info(result)
				}}
			>
				re-capture event
			</button>
		</main>
	)
}
