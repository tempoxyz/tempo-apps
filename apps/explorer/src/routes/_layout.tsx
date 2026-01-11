import { createFileRoute, Outlet, useMatchRoute } from '@tanstack/react-router'
import * as React from 'react'
import * as z from 'zod/mini'
import { FaucetCard } from '#comps/FaucetCard'
import { Footer } from '#comps/Footer'
import { Header } from '#comps/Header'
import { useIntroSeen } from '#comps/Intro'
import { Sphere } from '#comps/Sphere'
import {
	AppMode,
	AppModeProvider,
	detectAppMode,
} from '#lib/app-context.tsx'
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
	const [appMode, setAppMode] = React.useState<AppMode>(AppMode.Explorer)

	React.useEffect(() => {
		setAppMode(detectAppMode())
	}, [])

	if (isPlain) return <Outlet />

	return (
		<AppModeProvider mode={appMode}>
			<Layout blockNumber={blockNumber} appMode={appMode}>
				{appMode === AppMode.Faucet ? <FaucetPage /> : <Outlet />}
			</Layout>
		</AppModeProvider>
	)
}

function FaucetPage() {
	return (
		<div className="flex flex-1 size-full items-center justify-center px-4">
			<div className="w-full max-w-[560px]">
				<FaucetCard />
			</div>
		</div>
	)
}

export function Layout(props: Layout.Props) {
	const { children, blockNumber, appMode = AppMode.Explorer } = props
	const matchRoute = useMatchRoute()
	const introSeen = useIntroSeen()
	const isReceipt = Boolean(matchRoute({ to: '/receipt/$hash', fuzzy: true }))
	const isHome = Boolean(matchRoute({ to: '/' }))
	return (
		<div className="flex min-h-dvh flex-col print:block print:min-h-0">
			<div className="bg-base-alt px-[32px] py-[8px] text-sm text-primary text-center">
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
				<Header initialBlockNumber={blockNumber} appMode={appMode} />
			</div>
			<main className="flex flex-1 size-full flex-col items-center relative z-1 print:block print:flex-none">
				{children}
			</main>
<<<<<<< Updated upstream
			<div className="w-full mt-6 relative z-1 print:hidden">
				<Footer />
||||||| Stash base
			<div className="w-full mt-40 relative z-1 print:hidden">
				<Footer />
=======
			<div className="w-full mt-40 relative z-1 print:hidden">
				<Footer appMode={appMode} />
>>>>>>> Stashed changes
			</div>
<<<<<<< Updated upstream
			<Sphere animate={isHome && !introSeen} />
||||||| Stash base
			<Sphere animate={Boolean(matchRoute({ to: '/' }))} />
=======
			<Sphere animate={isHome || appMode === AppMode.Faucet} />
>>>>>>> Stashed changes
		</div>
	)
}

export namespace Layout {
	export interface Props {
		children: React.ReactNode
		blockNumber?: bigint
		appMode?: AppMode
	}
}
