import { useSuspenseQuery } from '@tanstack/react-query'
import { useMatchRoute } from '@tanstack/react-router'
import { Footer } from '#comps/Footer'
import { Header } from '#comps/Header'
import { useIntroSeen } from '#comps/Intro'
import { isTestnet } from '#lib/env'
import { fetchLatestBlock } from '#lib/server/latest-block.server'
import { Sphere } from '#comps/Sphere'
import TriangleAlert from '~icons/lucide/triangle-alert'

export function Layout(props: Layout.Props) {
	const { children, blockNumber: blockNumberProp } = props
	const { data: blockNumberQuery } = useSuspenseQuery({
		queryKey: ['latestBlock'],
		queryFn: () => fetchLatestBlock(),
	})
	const blockNumber = blockNumberProp ?? blockNumberQuery
	const matchRoute = useMatchRoute()
	const introSeen = useIntroSeen()
	const isReceipt = Boolean(matchRoute({ to: '/receipt/$hash', fuzzy: true }))
	const isHome = Boolean(matchRoute({ to: '/' }))
	return (
		<div className="flex min-h-dvh flex-col print:block print:min-h-0">
			{isTestnet() && (
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
							href="https://docs.tempo.xyz/#testnet-migration"
							className="underline press-down-inline"
							target="_blank"
							rel="noopener noreferrer"
						>
							Read the docs
						</a>{' '}
						for more details.
					</span>
				</div>
			)}
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
