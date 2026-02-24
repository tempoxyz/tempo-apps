import { useQueryClient } from '@tanstack/react-query'
import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import * as React from 'react'
import { useChainId, useSwitchChain } from 'wagmi'
import { ExploreInput } from '#comps/ExploreInput'
import { useAnimatedBlockNumber, useLiveBlockNumber } from '#lib/block-number'
import { signetParmigiana, signetHost } from '#lib/chains'
import { cx } from '#lib/css'
import { getTempoEnv, isTestnet } from '#lib/env'
import { useIsMounted } from '#lib/hooks'
import { ThemeToggle } from '#comps/ThemeToggle'

export function Header(props: Header.Props) {
	const { initialBlockNumber } = props

	return (
		<header className="@container relative z-1 border-b border-border-primary">
			<div className="px-[24px] @min-[1240px]:pt-[48px] @min-[1240px]:px-[84px] flex items-center justify-between min-h-16 pt-[36px] select-none relative z-1 print:justify-center">
				<div className="flex items-center gap-[12px] relative z-1 h-[28px]">
					<Link to="/" className="flex items-center press-down py-[4px]">
						<Header.TempoWordmark />
					</Link>
				</div>
				<Header.Search />
				<div className="relative z-1 print:hidden flex items-center gap-[8px]">
					<Header.ChainSwitcher />
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

	export function ChainSwitcher() {
		const env = getTempoEnv()
		const isSignet = env === 'parmigiana' || env === 'host'
		const chainId = useChainId()
		const { switchChain } = useSwitchChain()
		const queryClient = useQueryClient()
		const isMounted = useIsMounted()

		if (!isSignet) return null

		const isHost = chainId === signetHost.id

		function handleSwitch(targetChainId: number) {
			if (targetChainId === chainId) return
			switchChain({ chainId: targetChainId })
			queryClient.clear()
		}

		return (
			<div className="flex items-center rounded-full bg-base-alt/50 p-[2px] text-[12px] font-medium">
				<button
					type="button"
					className={cx(
						'rounded-full px-[10px] py-[3px] transition-colors',
						!isHost && isMounted
							? 'bg-primary text-on-primary'
							: 'text-tertiary hover:text-secondary',
					)}
					onClick={() => handleSwitch(signetParmigiana.id)}
				>
					Signet
				</button>
				<button
					type="button"
					className={cx(
						'rounded-full px-[10px] py-[3px] transition-colors',
						isHost && isMounted
							? 'bg-primary text-on-primary'
							: 'text-tertiary hover:text-secondary',
					)}
					onClick={() => handleSwitch(signetHost.id)}
				>
					Host
				</button>
			</div>
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
				<svg viewBox="0 0 16 16" className="size-[14px]" aria-hidden="true">
					<rect width="16" height="16" className="fill-[#D4A929] dark:fill-[#FAF7F2]" />
				</svg>
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

	export function TempoWordmark(_props: TempoWordmark.Props) {
		return (
			<span className="inline-flex items-center gap-[6px]">
				<svg
					viewBox="0 0 1105 1109"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					className="size-[18px]"
					aria-hidden="true"
				>
					<path d="M1078.29 545.64H551.906C547.353 545.64 542.98 547.468 539.744 550.719L-0.396 1092.84C-5.142 1097.6 -7.25 1096.62 -6.723 1089.9C-5.774 1077.53 -5.274 1063.54 -5.221 1047.93C-4.378 868.416 -4.959 700.558 -6.961 544.374C-8.067 461.074 14.458 369.186 53.114 294.302C114.184 175.922 205.994 90.032 328.554 36.604C463.234 -22.106 620.124 -22.979 756.304 34.7C963.374 122.37 1094.97 318.81 1096.63 544.854C1097.05 603.564 1097.18 786.784 1097.02 1094.5C1097.02 1098.42 1095.07 1100.38 1091.17 1100.38H551.434C550.824 1100.37 550.224 1100.19 549.714 1099.85C549.284 1099.49 548.994 1098.99 548.874 1098.45C548.854 1097.78 549.104 1097.13 549.564 1096.65L1083.92 560.244C1092.57 551.564 1090.77 547.234 1078.55 547.234L1078.29 545.64Z" fill="currentColor"/>
				</svg>
				<span className="font-display text-[16px] font-medium">Signet</span>
			</span>
		)
	}

	export namespace TempoWordmark {
		export interface Props {
			className?: string
		}
	}
}
