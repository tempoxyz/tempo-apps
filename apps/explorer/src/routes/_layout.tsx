import { createFileRoute, Outlet } from '@tanstack/react-router'

import { getBlock } from 'wagmi/actions'
import * as z from 'zod/mini'
import { Layout } from '#components/Layout.tsx'
import { getConfig } from '#wagmi.config'

export const Route = createFileRoute('/_layout')({
	component: Component,
	validateSearch: z.object({
		plain: z.optional(z.string()),
	}).parse,
	loader: async () => {
		const block = await getBlock(getConfig())
		return {
			recentTransactions: block.transactions.slice(0, 2),
			blockNumber: block.number,
		}
	},
})

function Component() {
	const search = Route.useSearch()
	if ('plain' in search) return <Outlet />
	return (
		<Layout>
			<Outlet />
		</Layout>
	)
}
