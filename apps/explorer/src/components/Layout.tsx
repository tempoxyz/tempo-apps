import { getRouteApi, useMatchRoute } from '@tanstack/react-router'
import { Footer } from '#components/Footer'
import { Header } from '#components/Header'
import { Sphere } from '#components/Sphere'

const routeApi = getRouteApi('/_layout')

export function Layout(props: Layout.Props) {
	const { children } = props
	const matchRoute = useMatchRoute()
	const { recentTransactions, blockNumber } = routeApi.useLoaderData()
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
