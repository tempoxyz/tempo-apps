import { waitUntil } from 'cloudflare:workers'
import { usePostHog } from '@posthog/react'
import { createFileRoute } from '@tanstack/react-router'
import { PostHog } from 'posthog-node'
import * as React from 'react'
import * as z from 'zod/mini'

export const Route = createFileRoute('/_layout/debug')({
	validateSearch: z.object({
		query: z.prefault(z.string(), 'foo'),
	}),
	component: RouteComponent,
	server: {
		handlers: {
			GET: async ({ request, next }) => {
				const url = new URL(request.url)
				const query = url.searchParams.get('query')
				const plain = url.searchParams.get('plain')

				const posthog = new PostHog(
					'phc_aNlTw2xAUQKd9zTovXeYheEUpQpEhplehCK5r1e31HR',
					{
						disabled: process.env.NODE_ENV !== 'production',
						host: 'https://us.i.posthog.com',
						flushAt: 1, // Send events immediately in edge environment
						flushInterval: 0, // Don't wait for interval
					},
				)
				if (!posthog) return next()

				waitUntil(
					posthog?.captureImmediate({
						event: '____explorer_test_event',
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

	const [result, setResult] = React.useState('')

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
			{/** biome-ignore lint/correctness/useUniqueElementIds: _ */}
			<button
				type="button"
				id="cta"
				className="cursor-pointer bg-accent text-white m-2 p-1"
				onClick={(event) => {
					event.preventDefault()
					console.info('re-capture event')

					const result = posthog?.capture('button_clicked')
					setResult(JSON.stringify(result, undefined, 2))
				}}
			>
				re-capture event
			</button>
			<br />
			<pre>{result}</pre>
		</main>
	)
}
