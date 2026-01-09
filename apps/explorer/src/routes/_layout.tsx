import { createFileRoute, Outlet, useMatchRoute } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { Footer } from '#comps/Footer'
import { Header } from '#comps/Header'
import { useIntroSeen } from '#comps/Intro'
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
	const introSeen = useIntroSeen()
	const isReceipt = Boolean(matchRoute({ to: '/receipt/$hash', fuzzy: true }))
	const isHome = Boolean(matchRoute({ to: '/' }))
	return (
		<div className="flex min-h-dvh flex-col print:block print:min-h-0">
			<div className="bg-gray-100 border-gray-300 px-[32px] py-[8px] text-sm text-black text-center">
				<TriangleAlert className="size-4 inline mr-[4px] relative top-[-1px]" />
				<span className="">
					<strong>Testnet migration:</strong> Tempo launched a new testnet
					(Moderato) on January 8th. The old testnet (Andantino) will be
					deprecated on{' '}
					<time dateTime="2026-03-08" title="March 8th, 2026">
						March 8th
					</time>
					.{' '}
					<a
						href="https://docs.tempo.xyz/network-upgrades"
						className="underline press-down-inline"
						target="_blank"
						rel="noopener noreferrer"
					>
						Read the docs
					</a>{' '}
					for more details.
				</span>
			</div>
			<div className={`relative z-2 ${isReceipt ? 'print:hidden' : ''}`}>
				<Header initialBlockNumber={blockNumber} />
			</div>
			<main className="flex flex-1 size-full flex-col items-center relative z-1 print:block print:flex-none">
				{children}
			</main>
			<div className="w-full mt-6 relative z-1 print:hidden">
				<Footer />
			</div>
			<Sphere animate={isHome && !introSeen} />
		</div>
	)
}

export namespace Layout {
	export interface Props {
		children: React.ReactNode
		blockNumber?: bigint
	}
}
