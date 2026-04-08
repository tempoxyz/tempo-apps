import { createFileRoute, Outlet } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { Layout } from '#comps/Layout'

export const Route = createFileRoute('/_layout')({
	component: RouteComponent,
	validateSearch: z.object({
		plain: z.optional(z.string()),
	}).parse,
})

function RouteComponent() {
	const search = Route.useSearch()
	const isPlain = 'plain' in search

	if (isPlain) return <Outlet />

	return (
		<Layout>
			<Outlet />
		</Layout>
	)
}
