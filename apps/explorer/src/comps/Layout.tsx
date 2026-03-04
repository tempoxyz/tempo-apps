import { BreadcrumbsPortal } from '#comps/Breadcrumbs'
import { Footer } from '#comps/Footer'
import { Header } from '#comps/Header'
import { Sphere } from '#comps/Sphere'
import { TestnetMigrationBanner } from '#comps/TestnetMigrationBanner'
import { BlockNumberProvider } from '#lib/block-number'
import { fetchLatestBlock } from '#lib/server/latest-block'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useMatchRoute, useRouterState } from '@tanstack/react-router'

export function Layout(props: Layout.Props) {
	const { children, blockNumber: blockNumberProp } = props
	const { data: blockNumberQuery } = useSuspenseQuery({
		queryKey: ['latestBlock'],
		queryFn: () => fetchLatestBlock(),
	})
	const blockNumber = blockNumberProp ?? blockNumberQuery
	const matchRoute = useMatchRoute()
	const isReceipt = Boolean(matchRoute({ to: '/receipt/$hash', fuzzy: true }))
	const isLanding = useRouterState({
		select: (state) =>
			(state.resolvedLocation?.pathname ?? state.location.pathname) === '/',
	})
	return (
		<BlockNumberProvider initial={blockNumber}>
			<div className="flex min-h-dvh flex-col print:block print:min-h-0">
				<TestnetMigrationBanner />
				<div className={`relative z-2 ${isReceipt ? 'print:hidden' : ''}`}>
					<Header initialBlockNumber={blockNumber} />
				</div>
				<main className="flex flex-1 size-full flex-col items-center relative z-1 print:block print:flex-none">
					<BreadcrumbsPortal />
					{children}
				</main>
				<div className="w-full mt-6 relative z-1 print:hidden">
					<Footer />
				</div>
				{isLanding && <Sphere />}
			</div>
		</BlockNumberProvider>
	)
}

export namespace Layout {
	export interface Props {
		children: React.ReactNode
		blockNumber?: bigint
	}
}
