import { Link, useRouterState } from '@tanstack/react-router'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { cx } from '#lib/css'
import ChevronRight from '~icons/lucide/chevron-right'
import Home from '~icons/lucide/home'
import X from '~icons/lucide/x'

const MAX_CRUMBS = 3

export interface Crumb {
	path: string
	label: string
	type: 'home' | 'tx' | 'receipt' | 'address' | 'token' | 'block' | 'other'
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

	if (pathname === '/blocks') {
		return { label: 'Blocks', type: 'other' }
	}

	if (pathname === '/tokens') {
		return { label: 'Tokens', type: 'other' }
	}

	if (pathname === '/block-builders') {
		return { label: 'Block Builders', type: 'other' }
	}

	if (pathname === '/orders') {
		return { label: 'Orders', type: 'other' }
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

	if (resolvedPathname === '/' && !hasPendingCrumb) {
		return null
	}

	if (displayCrumbs.length === 0) {
		return null
	}

	return (
		<nav
			aria-label="Breadcrumb"
			className={cx(
				'flex items-center gap-1 text-[12px] text-secondary overflow-x-auto scrollbar-none',
				className,
			)}
		>
			<Link
				to="/"
				className="flex items-center gap-1 text-tertiary hover:text-accent press-down shrink-0 outline-none focus-visible:text-accent"
				title="Home"
			>
				<Home className="size-3.5" />
			</Link>

			{displayCrumbs.map((crumb, index) => {
				const isLast = index === displayCrumbs.length - 1
				const isPending = isLast && hasPendingCrumb
				return (
					<React.Fragment key={crumb.path}>
						<ChevronRight className="size-3 text-tertiary shrink-0" />
						{isLast ? (
							<span
								className={cx(
									'font-medium truncate max-w-[120px]',
									isPending ? 'text-secondary animate-pulse' : 'text-primary',
								)}
								title={crumb.path}
							>
								{crumb.label}
							</span>
						) : (
							<Link
								to={crumb.path}
								className="text-secondary hover:text-accent press-down truncate max-w-[120px] outline-none focus-visible:text-accent"
								title={crumb.path}
							>
								{crumb.label}
							</Link>
						)}
					</React.Fragment>
				)
			})}

			{crumbs.length > 1 && (
				<button
					type="button"
					onClick={clearCrumbs}
					className="text-tertiary hover:text-primary press-down shrink-0 outline-none focus-visible:text-accent cursor-pointer"
					title="Clear navigation history"
				>
					<X className="size-3" />
				</button>
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
	const { setSlotEl, crumbs, pendingCrumb } = useBreadcrumbs()
	const ref = React.useRef<HTMLDivElement | null>(null)
	const [isPortalMounted, setIsPortalMounted] = React.useState(false)

	const currentPathname = useRouterState({
		select: (state) => state.location.pathname,
	})

	React.useLayoutEffect(() => {
		setSlotEl(ref.current)
		// Small delay to allow portal to mount
		const timer = setTimeout(() => setIsPortalMounted(true), 0)
		return () => {
			setSlotEl(null)
			clearTimeout(timer)
		}
	}, [setSlotEl])

	// Show loading fallback inline if:
	// 1. Portal hasn't mounted yet OR crumbs are empty
	// 2. We're not on home page (or navigating away from it)
	const showFallback =
		(!isPortalMounted || (crumbs.length === 0 && pendingCrumb === null)) &&
		currentPathname !== '/'

	return (
		<div ref={ref} className={className}>
			{showFallback && (
				<nav
					aria-label="Breadcrumb"
					className="flex items-center gap-1 text-[12px] text-secondary"
				>
					<Link
						to="/"
						className="flex items-center gap-1 text-tertiary hover:text-accent press-down shrink-0 outline-none focus-visible:text-accent"
						title="Home"
					>
						<Home className="size-3.5" />
					</Link>
					<ChevronRight className="size-3 text-tertiary shrink-0" />
					<span className="text-secondary animate-pulse">Loading…</span>
				</nav>
			)}
		</div>
	)
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
