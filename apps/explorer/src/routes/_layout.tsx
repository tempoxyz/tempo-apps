import { createFileRoute, Outlet, useMatchRoute } from '@tanstack/react-router'
import type { Hex } from 'ox'

import { getBlock } from 'wagmi/actions'
import * as z from 'zod/mini'
import { Footer } from '#components/Footer'
import { Header } from '#components/Header'
import { Sphere } from '#components/Sphere'
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
	const { recentTransactions, blockNumber } = Route.useLoaderData()
	if ('plain' in search) return <Outlet />
	return (
		<Layout blockNumber={blockNumber} recentTransactions={recentTransactions}>
			<Outlet />
		</Layout>
	)
}

export function Layout(props: Layout.Props) {
	const { children, blockNumber, recentTransactions } = props
	const matchRoute = useMatchRoute()
	return (
		<main className="flex min-h-dvh flex-col">
			<Header initialBlockNumber={blockNumber} />
			<main className="flex flex-1 size-full flex-col items-center relative z-1">
				{children}
			</main>
			<Footer recentTransactions={recentTransactions} />
			<Sphere animate={Boolean(matchRoute({ to: '/' }))} />
		</main>
	)
}

export namespace Layout {
	export interface Props {
		children: React.ReactNode
		blockNumber?: bigint
		recentTransactions?: Hex.Hex[]
	}
}
