import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import * as React from 'react'
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

	return { label: pathname, type: 'other' }
}

interface BreadcrumbsContextValue {
	crumbs: Crumb[]
	clearCrumbs: () => void
}

const BreadcrumbsContext = React.createContext<BreadcrumbsContextValue | null>(
	null,
)

export function BreadcrumbsProvider(props: { children: React.ReactNode }) {
	const { children } = props
	const [crumbs, setCrumbs] = React.useState<Crumb[]>([])
	const router = useRouter()

	React.useEffect(() => {
		return router.subscribe('onResolved', ({ toLocation, hrefChanged }) => {
			if (!hrefChanged) return

			const pathname = toLocation.pathname
			const { label, type } = getLabelForPath(pathname)

			setCrumbs((prev) => {
				if (pathname === '/') {
					return []
				}

				const existingIndex = prev.findIndex((c) => c.path === pathname)
				if (existingIndex !== -1) {
					return prev.slice(0, existingIndex + 1)
				}

				const newCrumb: Crumb = { path: pathname, label, type }
				return [...prev, newCrumb].slice(-MAX_CRUMBS)
			})
		})
	}, [router])

	const clearCrumbs = React.useCallback(() => {
		setCrumbs([])
	}, [])

	const value = React.useMemo(
		() => ({ crumbs, clearCrumbs }),
		[crumbs, clearCrumbs],
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
	const { crumbs, clearCrumbs } = useBreadcrumbs()

	const currentPathname = useRouterState({
		select: (state) => state.location.pathname,
	})

	if (currentPathname === '/' || crumbs.length === 0) {
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

			{crumbs.map((crumb, index) => {
				const isLast = index === crumbs.length - 1
				return (
					<React.Fragment key={crumb.path}>
						<ChevronRight className="size-3 text-tertiary shrink-0" />
						{isLast ? (
							<span
								className="text-primary font-medium truncate max-w-[120px]"
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
					className="ml-2 p-1 text-tertiary hover:text-primary hover:bg-base-alt rounded press-down shrink-0 outline-none focus-visible:text-accent"
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
