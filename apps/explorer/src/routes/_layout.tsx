import { createFileRoute, Outlet, useMatchRoute } from '@tanstack/react-router'

import { getBlock } from 'wagmi/actions'
import * as z from 'zod/mini'
import { Footer } from '#components/Footer'
import { Header } from '#components/Header'
import { Sphere } from '#components/Sphere'
import { getConfig } from '#wagmi.config'
import css from './styles.css?url'

export const Route = createFileRoute('/_layout')({
	head: () => ({
		links: [
			{
				rel: 'stylesheet',
				href: css,
			},
		],
	}),
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

export function Layout(props: Layout.Props) {
	const { children } = props
	const matchRoute = useMatchRoute()
	const { recentTransactions, blockNumber } = Route.useLoaderData()
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
	}
}
