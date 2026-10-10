import { Link, useRouterState } from '@tanstack/react-router'
import * as React from 'react'
import { style, variants } from '@tempoxyz/ds/platform'
import { createPortal } from 'react-dom'
import { cx } from 'zyzz'
import { pressDown, pulse } from '#styles/explorer'
import ChevronRight from '~icons/lucide/chevron-right'
import Home from '~icons/lucide/home'
import X from '~icons/lucide/x'

const MAX_CRUMBS = 3

export interface Crumb {
	path: string
	label: string
	type:
		| 'home'
		| 'tx'
		| 'receipt'
		| 'address'
		| 'token'
		| 'block'
		| 'policy'
		| 'other'
}

function truncateHash(hash: string, prefixLen = 6, suffixLen = 4): string {
	if (hash.length <= prefixLen + suffixLen + 2) return hash
	return `${hash.slice(0, prefixLen)}…${hash.slice(-suffixLen)}`
}

function getLabelForPath(pathname: string): {
	label: string
	type: Crumb['type']
} {
	if (pathname === '/') {
		return { label: 'Home', type: 'home' }
	}

	const txMatch = pathname.match(/^\/tx\/(0x[a-fA-F0-9]+)$/)
	if (txMatch) {
		return { label: `Tx ${truncateHash(txMatch[1])}`, type: 'tx' }
	}

	const receiptMatch = pathname.match(/^\/receipt\/(0x[a-fA-F0-9]+)$/)
	if (receiptMatch) {
		return {
			label: `Receipt ${truncateHash(receiptMatch[1])}`,
			type: 'receipt',
		}
	}

	const addressMatch = pathname.match(/^\/address\/(0x[a-fA-F0-9]+)$/)
	if (addressMatch) {
		return { label: `Addr ${truncateHash(addressMatch[1])}`, type: 'address' }
	}

	const tokenMatch = pathname.match(/^\/token\/(0x[a-fA-F0-9]+)$/)
	if (tokenMatch) {
		return { label: `Token ${truncateHash(tokenMatch[1])}`, type: 'token' }
	}

	const blockMatch = pathname.match(/^\/block\/(\d+|latest)$/)
	if (blockMatch) {
		return { label: `Block ${blockMatch[1]}`, type: 'block' }
	}

	const policyMatch = pathname.match(/^\/policy\/(\d+)$/)
	if (policyMatch) {
		return { label: `Policy #${policyMatch[1]}`, type: 'policy' }
	}

	if (pathname === '/blocks') {
		return { label: 'Blocks', type: 'other' }
	}

	if (pathname === '/tokens') {
		return { label: 'Tokens', type: 'other' }
	}

	return { label: pathname, type: 'other' }
}

interface BreadcrumbsContextValue {
	crumbs: Crumb[]
	pendingCrumb: Crumb | null
	clearCrumbs: () => void
	slotEl: HTMLElement | null
	setSlotEl: (el: HTMLElement | null) => void
}

const BreadcrumbsContext = React.createContext<BreadcrumbsContextValue | null>(
	null,
)

export function BreadcrumbsProvider(props: { children: React.ReactNode }) {
	const { children } = props
	const [crumbs, setCrumbs] = React.useState<Crumb[]>([])
	const [slotEl, setSlotEl] = React.useState<HTMLElement | null>(null)

	// Track resolved location for committing to history
	// Fall back to current location if resolvedLocation is not yet available
	const resolvedPathname = useRouterState({
		select: (state) =>
			state.resolvedLocation?.pathname ?? state.location.pathname,
	})

	// Track current location for pending/optimistic display
	const currentPathname = useRouterState({
		select: (state) => state.location.pathname,
	})

	// Track previous resolved pathname to detect changes
	const prevResolvedRef = React.useRef<string | null>(null)

	// Commit crumbs when navigation resolves successfully
	React.useEffect(() => {
		// Skip if pathname hasn't changed
		if (prevResolvedRef.current === resolvedPathname) return
		prevResolvedRef.current = resolvedPathname

		const { label, type } = getLabelForPath(resolvedPathname)

		setCrumbs((prev) => {
			if (resolvedPathname === '/') {
				return []
			}

			const existingIndex = prev.findIndex((c) => c.path === resolvedPathname)
			if (existingIndex !== -1) {
				return prev.slice(0, existingIndex + 1)
			}

			const newCrumb: Crumb = { path: resolvedPathname, label, type }
			return [...prev, newCrumb].slice(-MAX_CRUMBS)
		})
	}, [resolvedPathname])

	// Compute pending crumb for immediate UI feedback during navigation
	const pendingCrumb = React.useMemo<Crumb | null>(() => {
		// Only show pending crumb if navigating to a different path
		if (currentPathname === resolvedPathname || currentPathname === '/') {
			return null
		}
		// Don't show if it's already in crumbs
		if (crumbs.some((c) => c.path === currentPathname)) {
			return null
		}
		const { label, type } = getLabelForPath(currentPathname)
		return { path: currentPathname, label, type }
	}, [currentPathname, resolvedPathname, crumbs])

	const clearCrumbs = React.useCallback(() => {
		// Keep only the current page as a single crumb
		if (resolvedPathname === '/') {
			setCrumbs([])
		} else {
			const { label, type } = getLabelForPath(resolvedPathname)
			setCrumbs([{ path: resolvedPathname, label, type }])
		}
	}, [resolvedPathname])

	const value = React.useMemo(
		() => ({ crumbs, pendingCrumb, clearCrumbs, slotEl, setSlotEl }),
		[crumbs, pendingCrumb, clearCrumbs, slotEl],
	)

	return (
		<BreadcrumbsContext.Provider value={value}>
			{children}
		</BreadcrumbsContext.Provider>
	)
}

function useBreadcrumbs() {
	const context = React.useContext(BreadcrumbsContext)
	if (!context) {
		throw new Error('useBreadcrumbs must be used within BreadcrumbsProvider')
	}
	return context
}

export function Breadcrumbs(props: Breadcrumbs.Props) {
	const { className } = props
	const { crumbs, pendingCrumb, clearCrumbs } = useBreadcrumbs()

	const resolvedPathname = useRouterState({
		select: (state) =>
			state.resolvedLocation?.pathname ?? state.location.pathname,
	})

	// Combine committed crumbs with pending crumb for display
	const displayCrumbs = pendingCrumb ? [...crumbs, pendingCrumb] : crumbs
	const hasPendingCrumb = pendingCrumb !== null

	const isEmpty =
		(resolvedPathname === '/' && !hasPendingCrumb) || displayCrumbs.length === 0

	return (
		<nav
			aria-label="Breadcrumb"
			aria-hidden={isEmpty}
			{...styles.nav({ className, empty: isEmpty })}
		>
			{!isEmpty && (
				<>
					<Link to="/" {...cx(styles.home(), pressDown())} title="Home">
						<Home {...styles.homeIcon()} />
					</Link>

					{displayCrumbs.map((crumb, index) => {
						const isLast = index === displayCrumbs.length - 1
						const isPending = isLast && hasPendingCrumb
						return (
							<React.Fragment key={crumb.path}>
								<ChevronRight {...styles.separator()} />
								{isLast ? (
									<span
										{...styles.current({ pending: isPending })}
										title={crumb.path}
									>
										<CrumbLabel label={crumb.label} />
									</span>
								) : (
									<Link
										to={crumb.path}
										{...cx(styles.crumb(), pressDown())}
										title={crumb.path}
									>
										<CrumbLabel label={crumb.label} />
									</Link>
								)}
							</React.Fragment>
						)
					})}

					{crumbs.length > 1 && (
						<button
							type="button"
							onClick={clearCrumbs}
							{...cx(styles.clear(), pressDown())}
							title="Clear navigation history"
						>
							<X {...styles.clearIcon()} />
						</button>
					)}
				</>
			)}
		</nav>
	)
}

export namespace Breadcrumbs {
	export interface Props {
		className?: string
	}
}

export function BreadcrumbsSlot(props: BreadcrumbsSlot.Props) {
	const { className } = props
	const { setSlotEl } = useBreadcrumbs()
	const ref = React.useRef<HTMLDivElement | null>(null)

	React.useLayoutEffect(() => {
		setSlotEl(ref.current)
		return () => setSlotEl(null)
	}, [setSlotEl])

	return <div ref={ref} {...styles.slot({ className })} />
}

export namespace BreadcrumbsSlot {
	export interface Props {
		className?: string
	}
}

export function BreadcrumbsPortal() {
	const { slotEl } = useBreadcrumbs()

	if (slotEl) {
		return createPortal(<Breadcrumbs />, slotEl)
	}

	// No slot registered - BreadcrumbsSlot handles the loading fallback
	return null
}

function CrumbLabel(props: { label: string }): React.JSX.Element {
	const index = props.label.indexOf('0x')
	if (index === -1) return <>{props.label}</>
	return (
		<>
			{props.label.slice(0, index)}
			<span {...styles.hash()}>{props.label.slice(index)}</span>
		</>
	)
}

namespace styles {
	export const nav = variants({
		base: {
			alignItems: 'center',
			color: 'content.secondary',
			display: 'flex',
			gap: '4',
			height: '20',
			overflowX: 'auto',
			overflowY: 'hidden',
			paddingLeft: '2',
			transformOrigin: 'left',
			transitionDuration: '80ms',
			transitionProperty: 'opacity, scale',
			transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
			typography: 'body.b3',
		},
		defaultVariants: { empty: false },
		variants: {
			empty: {
				true: { opacity: 0, pointerEvents: 'none', scale: 0.97 },
				false: {
					opacity: 1,
					scale: 1,
					'@starting-style': { opacity: 0, scale: 0.97 },
				},
			},
		},
	})

	export const home = style({
		alignItems: 'center',
		color: 'content.tertiary',
		display: 'flex',
		flexShrink: 0,
		gap: '4',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
		':focus-visible': { color: 'content.primary' },
	})

	export const homeIcon = style({
		height: '14px !custom',
		width: '14px !custom',
	})

	export const separator = style({
		color: 'content.tertiary',
		flexShrink: 0,
		height: '12px !custom',
		width: '12px !custom',
	})

	export const current = variants({
		base: {
			maxWidth: '120px !custom',
			overflow: 'hidden',
			textOverflow: 'ellipsis',
			whiteSpace: 'nowrap',
		},
		defaultVariants: { pending: false },
		variants: {
			pending: {
				true: {
					animation: `${pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
					color: 'content.secondary',
				},
				false: { color: 'content.primary' },
			},
		},
	})

	export const crumb = style({
		color: 'content.secondary',
		maxWidth: '120px !custom',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
		':focus-visible': { color: 'content.primary' },
	})

	export const clear = style({
		color: 'content.tertiary',
		cursor: 'pointer',
		flexShrink: 0,
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
		':focus-visible': { color: 'content.primary' },
	})

	export const clearIcon = style({
		height: '12px !custom',
		width: '12px !custom',
	})

	export const slot = style({ minHeight: '20' })

	export const hash = style({
		fontFamily: '"JetBrains Mono", monospace',
		fontWeight: 400,
		letterSpacing: '0px',
	})
}
