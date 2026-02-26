import { createFileRoute, Outlet } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { Layout } from '#comps/Layout'
import { fetchLatestBlock } from '#lib/server/latest-block.ts'

export const Route = createFileRoute('/_layout')({
	component: RouteComponent,
	validateSearch: z.object({
		plain: z.optional(z.string()),
	}).parse,
	loader: async () => {
		try {
			return await fetchLatestBlock()
		} catch {
			return 0n
		}
	},
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
