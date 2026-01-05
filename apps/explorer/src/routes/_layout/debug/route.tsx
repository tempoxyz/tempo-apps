import { createFileRoute } from '@tanstack/react-router'
import posthog from 'posthog-js'
import * as React from 'react'
import * as z from 'zod/mini'

export const Route = createFileRoute('/_layout/debug')({
	validateSearch: z.object({
		query: z.string(),
	}),
	component: RouteComponent,
})

function RouteComponent() {
	const search = Route.useSearch()

	React.useEffect(() => {
		console.info(search)

		posthog.capture('_explorer_test_event', {
			url: window.location.href,
			query: search.query,
			timestamp: new Date(),
		})
	}, [search])

	return (
		<main>
			<pre>{JSON.stringify(search, undefined, 2)}</pre>
			<button
				type="button"
				onClick={() =>
					posthog.capture('_explorer_test_event', {
						url: window.location.href,
						query: search.query,
						timestamp: new Date(),
					})
				}
			>
				re-capture event
			</button>
		</main>
	)
}
