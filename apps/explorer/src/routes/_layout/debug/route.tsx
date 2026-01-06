import { usePostHog } from '@posthog/react'
import { createFileRoute } from '@tanstack/react-router'

import * as React from 'react'
import * as z from 'zod/mini'

export const Route = createFileRoute('/_layout/debug')({
	validateSearch: z.object({
		query: z.prefault(z.string(), 'foo'),
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
		<main className="flex flex-col items-center justify-center h-screen">
			<pre>{JSON.stringify(search, undefined, 2)}</pre>
			<button
				type="button"
				className="cursor-pointer bg-accent text-white m-2 p-1"
				onClick={() => {
					const result = posthog?.capture('button_clicked', {
						url: window.location.href,
						query: search.query,
						timestamp: new Date(),
					})
					console.info(result)
				}}
			>
				re-capture event
			</button>
		</main>
	)
}
