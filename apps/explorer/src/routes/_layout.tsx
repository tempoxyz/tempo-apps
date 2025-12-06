import { createFileRoute, Outlet, useMatchRoute } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { Footer } from '#components/ui/Footer'
import { Header } from '#components/ui/Header'
import { Sphere } from '#components/ui/Sphere'
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

export function Layout(props: Layout.Props) {
	const { children, blockNumber } = props
	const matchRoute = useMatchRoute()
	return (
		<div className="flex min-h-dvh flex-col">
			<div className="relative z-2">
				<Header initialBlockNumber={blockNumber} />
			</div>
			<main className="flex flex-1 size-full flex-col items-center relative z-1">
				{children}
			</main>
			<div className="w-full mt-40 relative z-1">
				<Footer />
			</div>
			<Sphere animate={Boolean(matchRoute({ to: '/' }))} />
		</div>
	)
}

export namespace Layout {
	export interface Props {
		children: React.ReactNode
		blockNumber?: bigint
	}
}
