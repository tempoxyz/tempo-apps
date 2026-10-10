import { BreadcrumbsPortal } from '#comps/Breadcrumbs'
import { Footer } from '#comps/Footer'
import { Header } from '#comps/Header'
import { lazy, Suspense, useId } from 'react'
import { BlockNumberProvider } from '#lib/block-number'
import { NotFoundProvider } from '#lib/not-found'
import { useMatchRoute, useRouterState } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import { cx } from 'zyzz'
import { srOnly } from '#styles/explorer'

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
				<div {...styles.root()}>
					<a href={`#${mainId}`} {...cx(srOnly(), styles.skipLink())}>
						Skip to content
					</a>
					<div {...cx(styles.header(), isReceipt && styles.printHidden())}>
						<Header />
					</div>
					<main id={mainId} tabIndex={-1} {...styles.main()}>
						<BreadcrumbsPortal />
						{children}
					</main>
					<div
						{...cx(
							styles.footer(),
							styles.printHidden(),
							isLanding && styles.footerLanding(),
						)}
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

namespace styles {
	export const root = style({
		display: 'flex',
		flexDirection: 'column',
		minHeight: '100dvh !custom',
		'@media print': { display: 'block', minHeight: '0px !custom' },
	})

	// Layered over `srOnly`: the link stays fixed and padded while hidden, and
	// focusing it releases the clipping in place.
	export const skipLink = style({
		backgroundColor: 'component.button.primary.fill',
		borderRadius: 'full',
		color: 'background.secondary',
		left: '12',
		paddingBlock: '12',
		paddingInline: '16',
		position: 'fixed',
		top: '12',
		typography: 'body.b2',
		zIndex: 50,
		':focus': {
			clipPath: 'none',
			height: 'auto !custom',
			margin: 'none',
			overflow: 'visible',
			padding: 'none',
			position: 'static',
			whiteSpace: 'normal',
			width: 'auto !custom',
		},
	})

	export const header = style({ position: 'relative', zIndex: 4 })

	export const printHidden = style({ '@media print': { display: 'none' } })

	export const main = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		height: '100% !custom',
		outlineStyle: 'none',
		position: 'relative',
		width: '100% !custom',
		zIndex: 1,
		selectors: { '&:has([role="listbox"])': { zIndex: 3 } },
		'@media print': { display: 'block', flex: 'none' },
	})

	export const footer = style({
		marginTop: '24',
		position: 'relative',
		width: '100% !custom',
		zIndex: 2,
	})

	export const footerLanding = style({
		pointerEvents: 'none',
		selectors: {
			'& a': { pointerEvents: 'auto' },
			'& button': { pointerEvents: 'auto' },
		},
	})
}
