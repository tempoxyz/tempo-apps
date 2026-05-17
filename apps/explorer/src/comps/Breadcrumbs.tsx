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
	group: string
	groupType:
		| 'home'
		| 'transaction'
		| 'receipt'
		| 'address'
		| 'token'
		| 'block'
		| 'other'
	id?: string
	idMono?: boolean
}

function truncateHash(hash: string, prefixLen = 6, suffixLen = 4): string {
	if (hash.length <= prefixLen + suffixLen + 2) return hash
	return `${hash.slice(0, prefixLen)}…${hash.slice(-suffixLen)}`
}

function getCrumbForPath(pathname: string): Omit<Crumb, 'path'> {
	if (pathname === '/') {
		return { group: 'Home', groupType: 'home' }
	}

	const txMatch = pathname.match(/^\/tx\/(0x[a-fA-F0-9]+)$/)
	if (txMatch) {
		return {
			group: 'Transaction',
			groupType: 'transaction',
			id: truncateHash(txMatch[1]),
			idMono: true,
		}
	}

	const receiptMatch = pathname.match(/^\/receipt\/(0x[a-fA-F0-9]+)$/)
	if (receiptMatch) {
		return {
			group: 'Receipt',
			groupType: 'receipt',
			id: truncateHash(receiptMatch[1]),
			idMono: true,
		}
	}

	const addressMatch = pathname.match(/^\/address\/(0x[a-fA-F0-9]+)$/)
	if (addressMatch) {
		return {
			group: 'Address',
			groupType: 'address',
			id: truncateHash(addressMatch[1]),
			idMono: true,
		}
	}

	const tokenMatch = pathname.match(/^\/token\/(0x[a-fA-F0-9]+)$/)
	if (tokenMatch) {
		return {
			group: 'Token',
			groupType: 'token',
			id: truncateHash(tokenMatch[1]),
			idMono: true,
		}
	}

	const blockMatch = pathname.match(/^\/block\/(\d+|latest)$/)
	if (blockMatch) {
		return {
			group: 'Block',
			groupType: 'block',
			id: blockMatch[1],
			idMono: true,
		}
	}

	if (pathname === '/blocks') {
		return { group: 'Blocks', groupType: 'other' }
	}

	if (pathname === '/tokens') {
		return { group: 'Tokens', groupType: 'other' }
	}

	return { group: pathname, groupType: 'other' }
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

	const resolvedPathname = useRouterState({
		select: (state) =>
			state.resolvedLocation?.pathname ?? state.location.pathname,
	})

	const currentPathname = useRouterState({
		select: (state) => state.location.pathname,
	})

	const prevResolvedRef = React.useRef<string | null>(null)

	React.useEffect(() => {
		if (prevResolvedRef.current === resolvedPathname) return
		prevResolvedRef.current = resolvedPathname

		const next = getCrumbForPath(resolvedPathname)

		setCrumbs((prev) => {
			if (resolvedPathname === '/') {
				return []
			}

			const existingIndex = prev.findIndex((c) => c.path === resolvedPathname)
			if (existingIndex !== -1) {
				return prev.slice(0, existingIndex + 1)
			}

			const newCrumb: Crumb = { path: resolvedPathname, ...next }
			return [...prev, newCrumb].slice(-MAX_CRUMBS)
		})
	}, [resolvedPathname])

	const pendingCrumb = React.useMemo<Crumb | null>(() => {
		if (currentPathname === resolvedPathname || currentPathname === '/') {
			return null
		}
		if (crumbs.some((c) => c.path === currentPathname)) {
			return null
		}
		const next = getCrumbForPath(currentPathname)
		return { path: currentPathname, ...next }
	}, [currentPathname, resolvedPathname, crumbs])

	const clearCrumbs = React.useCallback(() => {
		if (resolvedPathname === '/') {
			setCrumbs([])
		} else {
			const next = getCrumbForPath(resolvedPathname)
			setCrumbs([{ path: resolvedPathname, ...next }])
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

	const displayCrumbs = pendingCrumb ? [...crumbs, pendingCrumb] : crumbs
	const hasPendingCrumb = pendingCrumb !== null

	const isEmpty =
		(resolvedPathname === '/' && !hasPendingCrumb) || displayCrumbs.length === 0

	return (
		<nav
			aria-label="Breadcrumb"
			aria-hidden={isEmpty}
			className={cx(
				'flex items-center gap-1 text-[12px] text-secondary overflow-x-auto overflow-y-hidden scrollbar-none h-5 pl-0.5 origin-left transition-[opacity,scale] duration-[80ms] starting:opacity-0 starting:scale-[0.97]',
				isEmpty
					? 'opacity-0 scale-[0.97] pointer-events-none'
					: 'opacity-100 scale-100',
				className,
			)}
		>
			{!isEmpty && (
				<>
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
						const groupClasses = cx(
							'truncate max-w-[120px]',
							isLast && !crumb.id
								? isPending
									? 'font-medium text-secondary animate-pulse'
									: 'font-medium text-primary'
								: 'font-normal text-secondary',
						)
						const idClasses = cx(
							'truncate max-w-[120px]',
							crumb.idMono && 'font-mono tabular-nums',
							isPending
								? 'font-medium text-secondary animate-pulse'
								: 'font-medium text-primary',
						)
						return (
							<React.Fragment key={crumb.path}>
								<ChevronRight className="size-3 text-tertiary shrink-0" />
								{isLast ? (
									<span className={groupClasses} title={crumb.path}>
										{crumb.group}
									</span>
								) : (
									<Link
										to={crumb.path}
										className={cx(
											groupClasses,
											'hover:text-accent press-down outline-none focus-visible:text-accent',
										)}
										title={crumb.path}
									>
										{crumb.group}
									</Link>
								)}
								{crumb.id && (
									<>
										<ChevronRight className="size-3 text-tertiary shrink-0" />
										{isLast ? (
											<span className={idClasses} title={crumb.path}>
												{crumb.id}
											</span>
										) : (
											<Link
												to={crumb.path}
												className={cx(
													idClasses,
													'hover:text-accent press-down outline-none focus-visible:text-accent',
												)}
												title={crumb.path}
											>
												{crumb.id}
											</Link>
										)}
									</>
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

	return <div ref={ref} className={cx('min-h-5', className)} />
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

	return null
}
