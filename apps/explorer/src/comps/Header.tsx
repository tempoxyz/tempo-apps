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
import { getTempoEnv, isTestnet } from '#lib/env'
import SquareSquare from '~icons/lucide/square-square'

export function Header(): React.JSX.Element {
	const tempoEnv = getTempoEnv()
	const networkBadgeLabel =
		tempoEnv === 'mainnet' ? null : tempoEnv === 'devnet' ? 'Devnet' : 'Testnet'

	return (
		<header className="@container relative z-1">
			<div className="px-[24px] @min-[1240px]:pt-[48px] @min-[1240px]:px-[84px] flex items-center justify-between min-h-16 @min-[800px]:@max-[1239px]:h-[88px] pt-[36px] select-none relative z-1 print:justify-center">
				<div className="flex items-center gap-[12px] relative z-1 h-[28px]">
					<Link
						to="/"
						className="flex items-center gap-[12px] press-down py-[4px]"
					>
						<Header.TempoWordmark />
						{networkBadgeLabel && (
							<Header.NetworkBadge label={networkBadgeLabel} />
						)}
					</Link>
				</div>
				<Header.Search />
				<div className="relative z-1 print:hidden flex items-center gap-[8px]">
					<Header.BlockNumber />
				</div>
			</div>
			<Header.Search compact />
		</header>
	)
}

export namespace Header {
	export function Search(props: { compact?: boolean }) {
		const { compact = false } = props
		const router = useRouter()
		const navigate = useNavigate()
		const [inputValue, setInputValue] = React.useState('')
		const resolvedPathname = useRouterState({
			select: (state) =>
				state.resolvedLocation?.pathname ?? state.location.pathname,
		})
		const showSearch = resolvedPathname !== '/'

		React.useEffect(() => {
			return router.subscribe('onResolved', ({ hrefChanged }) => {
				if (hrefChanged) setInputValue('')
			})
		}, [router])

		if (!showSearch) return null

		const exploreInput = (
			<ExploreInput
				value={inputValue}
				onChange={setInputValue}
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
		const isReady = blockNumber != null

		return (
			<Link
				disabled={!isTestnet()}
				to="/block/$id"
				params={{ id: blockNumber != null ? String(blockNumber) : 'latest' }}
				className={cx(
					className,
					'flex items-center gap-[6px] text-[15px] font-medium text-secondary press-down origin-right transition-[opacity,scale] duration-[80ms]',
					isReady ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]',
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
				viewBox="0 0 107 25"
				className={classes}
				role="img"
			>
				<path d="M8.10464 23.7163H1.82475L7.64513 5.79356H0.201172L1.82475 0.540352H22.5637L20.9401 5.79356H13.8944L8.10464 23.7163Z" />
				<path d="M31.474 23.7163H16.5861L24.0607 0.540352H38.8873L37.4782 4.95923H28.8701L27.3078 9.93433H35.6402L34.231 14.2914H25.8681L24.3057 19.2974H32.8525L31.474 23.7163Z" />
				<path d="M38.2124 23.7163H33.2192L40.7244 0.540352H49.0567L48.781 13.0245L56.8989 0.540352H66.0277L58.5531 23.7163H52.3039L57.3584 7.86395L46.9736 23.7163H43.267L43.4201 7.80214L38.2124 23.7163Z" />
				<path d="M73.057 4.83563L70.6369 12.3137H71.3108C72.8425 12.3137 74.1189 11.9532 75.14 11.2322C76.1612 10.4906 76.8249 9.43991 77.1312 8.08025C77.3967 6.90601 77.2538 6.07167 76.7023 5.57725C76.1509 5.08284 75.2319 4.83563 73.9453 4.83563H73.057ZM66.9915 23.7163H60.7116L68.1862 0.540352H75.814C77.5703 0.540352 79.0816 0.828764 80.3478 1.40559C81.6344 1.96181 82.5738 2.76524 83.166 3.81588C83.7787 4.84592 83.9829 6.05107 83.7787 7.43133C83.5132 9.2442 82.8189 10.8408 81.6956 12.221C80.5724 13.6013 79.1122 14.6725 77.315 15.4347C75.5383 16.1764 73.5471 16.5472 71.3415 16.5472H69.289L66.9915 23.7163Z" />
				<path d="M98.747 22.233C96.664 23.4691 94.4481 24.0871 92.0996 24.0871H92.0383C89.9552 24.0871 88.1989 23.6236 86.7693 22.6965C85.3602 21.7489 84.3493 20.4717 83.7366 18.8648C83.1443 17.2579 83.0014 15.4966 83.3077 13.5807C83.6957 11.1704 84.5841 8.94549 85.9728 6.90601C87.3616 4.86653 89.0975 3.23906 91.1805 2.02361C93.2636 0.808164 95.4897 0.200439 97.8587 0.200439H97.9199C100.085 0.200439 101.872 0.663958 103.281 1.591C104.71 2.51803 105.701 3.78498 106.252 5.39185C106.824 6.97811 106.947 8.76008 106.62 10.7378C106.232 13.0657 105.343 15.2596 103.955 17.3197C102.566 19.3592 100.83 20.997 98.747 22.233ZM90.0777 18.2468C90.6292 19.2974 91.589 19.8227 92.9573 19.8227H93.0186C94.1418 19.8227 95.1833 19.4004 96.1432 18.5558C97.1235 17.6905 97.9506 16.5369 98.6245 15.0948C99.3189 13.6528 99.8294 12.0459 100.156 10.2742C100.463 8.54377 100.34 7.15322 99.7886 6.10257C99.2372 5.03133 98.2875 4.49571 96.9397 4.49571H96.8784C95.8369 4.49571 94.826 4.92833 93.8457 5.79356C92.8858 6.6588 92.0485 7.82274 91.3337 9.2854C90.6189 10.7481 90.0982 12.3343 89.7714 14.0442C89.4446 15.7747 89.5468 17.1755 90.0777 18.2468Z" />
			</svg>
		)
	}

	export namespace TempoWordmark {
		export interface Props {
			className?: string
		}
	}

	export function NetworkBadge(props: NetworkBadge.Props) {
		const { label } = props

		return (
			<span className="flex h-[28px] shrink-0 items-center justify-center gap-[4px] rounded-[8px] border border-[#2C2C2F] bg-[#1A1A1A] px-[8px] py-[4px] text-[14px] font-medium leading-[140%] text-secondary">
				<span aria-hidden className="size-[6px] rounded-full bg-amber-400" />
				{label}
			</span>
		)
	}

	export namespace NetworkBadge {
		export interface Props {
			label: 'Devnet' | 'Testnet'
		}
	}
}
