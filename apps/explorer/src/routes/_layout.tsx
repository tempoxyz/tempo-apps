import { createFileRoute, Outlet } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { Layout } from '#comps/Layout'
import { fetchLatestBlock } from '#lib/server/latest-block.server.ts'

export const Route = createFileRoute('/_layout')({
	component: RouteComponent,
	validateSearch: z.object({
		plain: z.optional(z.string()),
	}).parse,
	loader: () => fetchLatestBlock(),
})

function RouteComponent() {
	const search = Route.useSearch()
	const isPlain = 'plain' in search
	const blockNumber = Route.useLoaderData()

	if (isPlain) return <Outlet />

	return (
		<Layout blockNumber={blockNumber}>
			<Outlet />
		</Layout>
	)
}
