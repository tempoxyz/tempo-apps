import { BreadcrumbsPortal } from '#comps/Breadcrumbs'
import { Footer } from '#comps/Footer'
import { Header } from '#comps/Header'
import { lazy, Suspense, useId } from 'react'
import { BlockNumberProvider } from '#lib/block-number'
import { NotFoundProvider } from '#lib/not-found'
import { useMatchRoute, useRouterState } from '@tanstack/react-router'

const Sphere = lazy(() =>
	import('#comps/Sphere').then(({ Sphere }) => ({ default: Sphere })),
)

export function Layout(props: Layout.Props) {
	const { children } = props
	const mainId = useId()
	const matchRoute = useMatchRoute()
	const isReceipt = Boolean(matchRoute({ to: '/receipt/$hash', fuzzy: true }))
	const isLanding = useRouterState({
		select: (state) =>
			(state.resolvedLocation?.pathname ?? state.location.pathname) === '/',
	})
	return (
		<NotFoundProvider>
			<BlockNumberProvider>
				<div className="flex min-h-dvh flex-col print:block print:min-h-0">
					<a
						href={`#${mainId}`}
						className="sr-only focus:not-sr-only fixed top-3 left-3 z-50 rounded-button bg-accent text-on-accent px-4 py-3"
					>
						Skip to content
					</a>
					<div className={`relative z-4 ${isReceipt ? 'print:hidden' : ''}`}>
						<Header />
					</div>
					<main
						id={mainId}
						tabIndex={-1}
						className="outline-none has-[[role=listbox]]:z-3 flex flex-1 size-full flex-col items-center relative z-1 print:block print:flex-none"
					>
						<BreadcrumbsPortal />
						{children}
					</main>
					<div
						className={`w-full mt-6 relative z-2 print:hidden ${isLanding ? 'pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto' : ''}`}
					>
						{isLanding && (
							<Suspense fallback={null}>
								<Sphere />
							</Suspense>
						)}
						<Footer />
					</div>
				</div>
			</BlockNumberProvider>
		</NotFoundProvider>
	)
}

export namespace Layout {
	export interface Props {
		children: React.ReactNode
	}
}
