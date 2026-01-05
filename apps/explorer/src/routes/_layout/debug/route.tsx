import { usePostHog } from '@posthog/react'
import { createFileRoute } from '@tanstack/react-router'

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
	const posthog = usePostHog()

	React.useEffect(() => {
		console.info(search)
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
		<main>
			<pre>{JSON.stringify(search, undefined, 2)}</pre>
			<button
				type="button"
				onClick={() =>
					posthog?.capture('button_clicked', {
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
