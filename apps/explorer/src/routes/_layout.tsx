import { createFileRoute, Outlet } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { Layout } from '#comps/Layout'
import { isMultisigExplorer } from '#lib/multisig'

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
			{isMultisigExplorer() && (
				<div
					className="border-b border-base-border bg-surface px-4 py-3 copy-13 text-secondary"
					role="status"
				>
					Multisig devnet · Blocks and transactions use multisig1 RPC. Indexed
					history, token lists, and source verification are not available.
				</div>
			)}
			<Outlet />
		</Layout>
	)
}
