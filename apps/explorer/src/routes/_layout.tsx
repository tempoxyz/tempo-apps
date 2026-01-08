import { createFileRoute, Outlet, useMatchRoute } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { Footer } from '#comps/Footer'
import { Header } from '#comps/Header'
import { Sphere } from '#comps/Sphere'
import { fetchLatestBlock } from '#lib/server/latest-block.server.ts'
import TriangleAlert from '~icons/lucide/triangle-alert'

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
	const isReceipt = Boolean(matchRoute({ to: '/receipt/$hash', fuzzy: true }))
	return (
		<div className="flex min-h-dvh flex-col print:block print:min-h-0">
			<div className="bg-[#fefbe9] dark:bg-[#1d180f] border-b border-[#f3d673] dark:border-[#5c3d05] px-4 py-3 text-center text-sm">
				<div className="flex items-center justify-center gap-2">
					<TriangleAlert className="size-4 text-[#ab6400] dark:text-[#ffca16] shrink-0" />
					<span className="text-[#4f3422] dark:text-[#ffe7b3]">
						<strong>Andantino testnet deprecation:</strong> We launched our new
						<strong> Moderato</strong> testnet on Jan 8th, Andantino will be
						deprecated on March 8th. See{' '}
						<a
							href="https://docs.tempo.xyz/quickstart/connection-details#direct-connection-details"
							className="underline hover:no-underline"
							target="_blank"
							rel="noopener noreferrer"
						>
							Connection Details
						</a>{' '}
						for the new configuration.
					</span>
				</div>
			</div>
			<div className={`relative z-2 ${isReceipt ? 'print:hidden' : ''}`}>
				<Header initialBlockNumber={blockNumber} />
			</div>
			<main className="flex flex-1 size-full flex-col items-center relative z-1 print:block print:flex-none">
				{children}
			</main>
			<div className="w-full mt-40 relative z-1 print:hidden">
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
