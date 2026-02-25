import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import * as React from 'react'
import { ExploreInput } from '#comps/ExploreInput'
import { useAnimatedBlockNumber, useLiveBlockNumber } from '#lib/block-number'
import { cx } from '#lib/css'
import { isTestnet } from '#lib/env'
import { useIsMounted } from '#lib/hooks'
import SquareSquare from '~icons/lucide/square-square'
import { ThemeToggle } from '#comps/ThemeToggle'

export function Header(props: Header.Props) {
	const { initialBlockNumber } = props

	return (
		<header className="@container relative z-1">
			<div className="px-[24px] @min-[1240px]:pt-[48px] @min-[1240px]:px-[84px] flex items-center justify-between min-h-16 pt-[36px] select-none relative z-1 print:justify-center">
				<div className="flex items-center gap-[12px] relative z-1 h-[28px]">
					<Link to="/" className="flex items-center press-down py-[4px]">
						<Header.TempoWordmark />
					</Link>
				</div>
				<Header.Search />
				<div className="relative z-1 print:hidden flex items-center gap-[8px]">
					<ThemeToggle />
					<Header.BlockNumber initial={initialBlockNumber} />
				</div>
			</div>
			<Header.Search compact />
		</header>
	)
}

export namespace Header {
	export interface Props {
		initialBlockNumber?: bigint
	}

	export function Search(props: { compact?: boolean }) {
		const { compact = false } = props
		const router = useRouter()
		const navigate = useNavigate()
		const [inputValue, setInputValue] = React.useState('')

		const [delayedNavigating, setDelayedNavigating] = React.useState(false)
		const { resolvedPathname, isNavigating } = useRouterState({
			select: (state) => ({
				resolvedPathname:
					state.resolvedLocation?.pathname ?? state.location.pathname,
				isNavigating: state.status === 'pending',
			}),
		})
		const showSearch = resolvedPathname !== '/'

		const isMounted = useIsMounted()

		React.useEffect(() => {
			return router.subscribe('onResolved', ({ hrefChanged }) => {
				if (hrefChanged) setInputValue('')
			})
		}, [router])

		// delay disabling the input to avoid blinking on fast navigations
		React.useEffect(() => {
			if (!isNavigating) {
				setDelayedNavigating(false)
				return
			}
			const timer = setTimeout(() => setDelayedNavigating(true), 100)
			return () => clearTimeout(timer)
		}, [isNavigating])

		if (!showSearch) return null

		const exploreInput = (
			<ExploreInput
				value={inputValue}
				onChange={setInputValue}
				disabled={isMounted && delayedNavigating}
				onActivate={({ value, type }) => {
					if (type === 'block') {
						navigate({ to: '/block/$id', params: { id: value } })
						return
					}
					if (type === 'hash') {
						navigate({ to: '/receipt/$hash', params: { hash: value } })
						return
					}
					if (type === 'token') {
						navigate({ to: '/token/$address', params: { address: value } })
						return
					}
					if (type === 'address') {
						navigate({
							to: '/address/$address',
							params: { address: value },
						})
						return
					}
				}}
			/>
		)

		if (compact)
			return (
				<div className="@min-[800px]:hidden sticky top-0 z-10 px-4 pt-[16px] pb-[12px] print:hidden">
					<ExploreInput
						wide
						value={inputValue}
						onChange={setInputValue}
						disabled={isMounted && delayedNavigating}
						onActivate={({ value, type }) => {
							if (type === 'block') {
								navigate({ to: '/block/$id', params: { id: value } })
								return
							}
							if (type === 'hash') {
								navigate({ to: '/receipt/$hash', params: { hash: value } })
								return
							}
							if (type === 'token') {
								navigate({ to: '/token/$address', params: { address: value } })
								return
							}
							if (type === 'address') {
								navigate({
									to: '/address/$address',
									params: { address: value },
								})
								return
							}
						}}
					/>
				</div>
			)

		return (
			<>
				<div className="absolute left-0 right-0 justify-center flex z-1 h-0 items-center @max-[1239px]:hidden print:hidden">
					{exploreInput}
				</div>
				<div className="flex-1 flex justify-center px-[24px] @max-[799px]:hidden @min-[1240px]:hidden print:hidden">
					<ExploreInput
						wide
						value={inputValue}
						onChange={setInputValue}
						disabled={isMounted && delayedNavigating}
						onActivate={({ value, type }) => {
							if (type === 'block') {
								navigate({ to: '/block/$id', params: { id: value } })
								return
							}
							if (type === 'hash') {
								navigate({ to: '/receipt/$hash', params: { hash: value } })
								return
							}
							if (type === 'token') {
								navigate({ to: '/token/$address', params: { address: value } })
								return
							}
							if (type === 'address') {
								navigate({
									to: '/address/$address',
									params: { address: value },
								})
								return
							}
						}}
					/>
				</div>
			</>
		)
	}

	export function BlockNumber(props: BlockNumber.Props) {
		const { initial, className } = props
		const resolvedPathname = useRouterState({
			select: (state) =>
				state.resolvedLocation?.pathname ?? state.location.pathname,
		})
		const optimisticBlockNumber = useAnimatedBlockNumber(initial)
		const liveBlockNumber = useLiveBlockNumber(initial)
		const blockNumber =
			resolvedPathname === '/blocks' ? liveBlockNumber : optimisticBlockNumber

		return (
			<Link
				disabled={!isTestnet()}
				to="/block/$id"
				params={{ id: blockNumber != null ? String(blockNumber) : 'latest' }}
				className={cx(
					className,
					'flex items-center gap-[6px] text-[15px] font-medium text-secondary press-down',
				)}
				title="View latest block"
			>
				<SquareSquare className="size-[18px] text-accent" />
				<div className="text-nowrap">
					<span className="text-primary font-medium tabular-nums font-mono min-w-[6ch] inline-block">
						{blockNumber != null ? String(blockNumber) : '…'}
					</span>
				</div>
			</Link>
		)
	}

	export namespace BlockNumber {
		export interface Props {
			initial?: bigint
			className?: string | undefined
		}
	}

	export function TempoWordmark(props: TempoWordmark.Props) {
		const { className } = props

		const baseClass = 'h-6 w-auto fill-current text-primary'
		const classes = className ? `${baseClass} ${className}` : baseClass

		return (
			<svg
				aria-label="Tempo"
				viewBox="505 435 900 210"
				className={classes}
				role="img"
			>
				<path d="M576.59,636.9h-53.04l49.16-150.06h-62.87l13.71-43.98h175.16l-13.71,43.98h-59.51l-48.9,150.06Z" />
				<path d="M773.97,636.9h-125.74l63.13-194.05h125.23l-11.9,37h-72.7l-13.2,41.66h70.38l-11.9,36.48h-70.63l-13.2,41.91h72.19l-11.64,37Z" />
				<path d="M830.88,636.9h-42.17l63.39-194.05h70.38l-2.33,104.79,68.56-104.79h77.1l-63.13,194.05h-52.78l41.91-130.4h-.78l-86.16,130.4h-31.31l1.29-131.95h-.52l-43.47,131.95Z" />
				<path d="M1125.18,478.81l-20.44,62.61h5.69c12.94,0,23.72-3.02,32.34-9.06,8.62-6.21,14.23-15.01,16.82-26.39,2.24-9.83,1.04-16.82-3.62-20.96-4.66-4.14-12.42-6.21-23.29-6.21h-7.5ZM1073.95,636.9h-53.04l63.13-194.05h64.42c14.83,0,27.6,2.41,38.29,7.24,10.87,4.66,18.8,11.38,23.8,20.18,5.17,8.62,6.9,18.71,5.17,30.27-2.24,15.18-8.11,28.55-17.59,40.1-9.49,11.56-21.82,20.53-37,26.91-15.01,6.21-31.82,9.31-50.45,9.31h-17.34l-19.4,60.03Z" />
				<path d="M1342.16,624.48c-17.59,10.35-36.31,15.52-56.15,15.52h-.52c-17.59,0-32.43-3.88-44.5-11.64-11.9-7.93-20.44-18.63-25.61-32.08-5-13.45-6.21-28.2-3.62-44.24,3.28-20.18,10.78-38.81,22.51-55.89,11.73-17.08,26.39-30.7,43.98-40.88,17.59-10.18,36.4-15.27,56.4-15.27h.52c18.28,0,33.38,3.88,45.28,11.64,12.07,7.76,20.44,18.37,25.1,31.82,4.83,13.28,5.86,28.2,3.1,44.76-3.28,19.49-10.78,37.86-22.51,55.11-11.73,17.08-26.39,30.79-43.98,41.14ZM1268.94,591.1c4.66,8.8,12.76,13.19,24.32,13.19h.52c9.49,0,18.28-3.54,26.39-10.61,8.28-7.24,15.27-16.9,20.96-28.98,5.86-12.07,10.18-25.53,12.94-40.36,2.59-14.49,1.55-26.13-3.1-34.93-4.66-8.97-12.68-13.45-24.06-13.45h-.52c-8.8,0-17.34,3.62-25.61,10.87-8.11,7.24-15.18,16.99-21.22,29.24-6.04,12.25-10.44,25.53-13.2,39.84-2.76,14.49-1.9,26.22,2.59,35.19Z" />
			</svg>
		)
	}

	export namespace TempoWordmark {
		export interface Props {
			className?: string
		}
	}
}
