import { useMatchRoute, useRouterState } from '@tanstack/react-router'
import { vars as core } from '@tempoxyz/ds/core'
import { style, vars } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { cx } from 'zyzz'
import { BreadcrumbsPortal } from '#comps/Breadcrumbs'
import { Footer } from '#comps/Footer'
import { Header } from '#comps/Header'
import { BlockNumberProvider } from '#lib/block-number'
import { useIsMounted } from '#lib/hooks'
import { NotFoundProvider } from '#lib/not-found'
import { srOnly } from '#styles/explorer'

const Sphere = React.lazy(() =>
	import('#comps/Sphere').then(({ Sphere }) => ({ default: Sphere })),
)

export function Layout(props: Layout.Props): React.JSX.Element {
	const { children } = props
	const mainId = React.useId()
	const matchRoute = useMatchRoute()
	const isReceipt = Boolean(matchRoute({ to: '/receipt/$hash', fuzzy: true }))
	const isLanding = useRouterState({
		select: (state) =>
			(state.resolvedLocation?.pathname ?? state.location.pathname) === '/',
	})
	// The sphere's styles are not in the server-rendered route styles, so it
	// renders after hydration to avoid a layout shift.
	const isMounted = useIsMounted()

	return (
		<NotFoundProvider>
			<BlockNumberProvider>
				<div {...styles.root()}>
					<a
						href={`#${mainId}`}
						{...cx(vars({ set: 'inverse' }), srOnly(), styles.skipLink())}
					>
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
						{isLanding && isMounted && (
							<React.Suspense fallback={null}>
								<Sphere />
							</React.Suspense>
						)}
						<Footer />
					</div>
				</div>
			</BlockNumberProvider>
		</NotFoundProvider>
	)
}

export declare namespace Layout {
	type Props = {
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

	// Applied over `srOnly` in the inverse set: fixed and padded while clipped,
	// so focusing it only releases the clip. The ring uses the page's primary
	// content color because the inverse one matches the page background.
	export const skipLink = style({
		backgroundColor: 'background.primary',
		borderRadius: 'full',
		color: 'content.primary',
		left: '12',
		paddingBlock: '12',
		paddingInline: '24',
		position: 'fixed',
		top: '12',
		typography: 'body.b2',
		zIndex: 50,
		':focus': {
			clipPath: 'none',
			height: 'auto !custom',
			margin: 'none',
			overflow: 'visible',
			width: 'auto !custom',
		},
		':focus-visible': {
			outlineColor: `light-dark(${core.color.neutral['100']}, ${core.color.neutral['000']}) !custom`,
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
