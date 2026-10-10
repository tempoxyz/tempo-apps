import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { Button, style, variants, vars } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { cx } from 'zyzz'
import { ExploreInput } from '#comps/ExploreInput'
import { useAnimatedBlockNumber, useLiveBlockNumber } from '#lib/block-number'
import { type TempoEnv, getTempoEnv, isTestnet } from '#lib/env'
import {
	buildExplorerNetworkHref,
	EXPLORER_NETWORK_OPTIONS,
	getActiveExplorerNetworkOption,
	isExplorerNetworkPathPreservable,
} from '#lib/explorer-network'
import { useIsNotFoundPage } from '#lib/not-found'
import { link, ping, pressDown, transitionColors } from '#styles/explorer'
import ChevronDownIcon from '~icons/lucide/chevron-down'
import SquareSquare from '~icons/lucide/square-square'
import FlaskConicalIcon from '~icons/lucide/flask-conical'

export function Header(): React.JSX.Element {
	const tempoEnv = getTempoEnv()

	return (
		<header {...styles.header()}>
			<div {...styles.bar()}>
				<div {...styles.brand()}>
					<Link to="/" {...cx(styles.homeLink(), pressDown())}>
						<Header.TempoWordmark />
					</Link>
					<Header.NetworkBadge tempoEnv={tempoEnv} />
				</div>
				<Header.Search />
				<div {...styles.actions()}>
					<Link
						to="/simulate"
						aria-label="Simulate transaction"
						{...cx(styles.simulate(), transitionColors(), pressDown())}
					>
						<FlaskConicalIcon {...styles.simulateIcon()} />
						<span {...styles.simulateLabel()}>Simulate</span>
					</Link>
					<Header.BlockNumber hideWhenNarrow />
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
				<div {...styles.searchCompact()}>
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
				<div {...styles.searchCentered()}>{exploreInput}</div>
				<div {...styles.searchInline()}>
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

	export function NetworkBadge(props: NetworkBadge.Props): React.JSX.Element {
		const { tempoEnv } = props
		const [isOpen, setIsOpen] = React.useState(false)
		const menuId = React.useId()
		const rootRef = React.useRef<HTMLDivElement>(null)
		const activeOption = getActiveExplorerNetworkOption(tempoEnv)
		const isNotFoundPage = useIsNotFoundPage()
		const currentPath = useRouterState({
			select: (state) => {
				const location = state.resolvedLocation ?? state.location
				const hash = location.hash ? `#${location.hash.replace(/^#/, '')}` : ''
				return `${location.pathname}${location.searchStr}${hash}`
			},
		})

		React.useEffect(() => {
			if (!isOpen) return

			function handlePointerDown(event: PointerEvent) {
				if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
			}

			function handleKeyDown(event: KeyboardEvent) {
				if (event.key === 'Escape') setIsOpen(false)
			}

			window.addEventListener('pointerdown', handlePointerDown)
			window.addEventListener('keydown', handleKeyDown)

			return () => {
				window.removeEventListener('pointerdown', handlePointerDown)
				window.removeEventListener('keydown', handleKeyDown)
			}
		}, [isOpen])

		return (
			<div ref={rootRef} {...styles.network()}>
				{/* TDS Button owns the pill, fill, type, and focus ring. The local
				    style only adds what Button leaves unset (shrink, hover, motion). */}
				<Button
					type="button"
					aria-controls={isOpen ? menuId : undefined}
					aria-expanded={isOpen}
					aria-haspopup="menu"
					scale="small"
					variant="secondary"
					{...cx(styles.networkTrigger(), transitionColors(), pressDown())}
					title={`Network: ${activeOption.label}`}
					onClick={() => setIsOpen((value) => !value)}
				>
					<Header.NetworkStatusDot tone={activeOption.dotTone} />
					<span>{activeOption.label}</span>
					<ChevronDownIcon {...styles.networkChevron({ open: isOpen })} />
				</Button>
				{isOpen && (
					<div
						id={menuId}
						role="menu"
						aria-label="Tempo network"
						{...styles.networkMenu()}
					>
						{EXPLORER_NETWORK_OPTIONS.map((option) => {
							const isActive = option.env === activeOption.env

							return (
								<a
									key={option.env}
									href={buildExplorerNetworkHref(option.host, currentPath, {
										fallbackToHome:
											isNotFoundPage &&
											!isExplorerNetworkPathPreservable(currentPath),
									})}
									role="menuitemradio"
									aria-checked={isActive}
									aria-current={isActive ? 'page' : undefined}
									{...cx(
										styles.networkOption({ active: isActive }),
										transitionColors(),
									)}
									onClick={() => setIsOpen(false)}
								>
									<Header.NetworkStatusDot tone={option.dotTone} />
									<span>{option.label}</span>
								</a>
							)
						})}
					</div>
				)}
			</div>
		)
	}

	export namespace NetworkBadge {
		export interface Props {
			tempoEnv: TempoEnv
		}
	}

	export function BlockNumber(props: BlockNumber.Props) {
		const { initial, className, hideWhenNarrow = false } = props
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
				{...cx(
					styles.blockNumber({
						className,
						narrow: hideWhenNarrow ? 'hidden' : 'shown',
						ready: isReady,
					}),
					pressDown(),
				)}
				title="View latest block"
			>
				<SquareSquare {...cx(styles.blockNumberIcon(), link())} />
				<div {...styles.blockNumberText()}>
					<span {...styles.blockNumberValue()}>
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
			/** Hide the block number when the header is narrower than 400px. */
			hideWhenNarrow?: boolean | undefined
		}
	}

	export function TempoWordmark(props: TempoWordmark.Props) {
		const { className } = props

		return (
			<svg
				aria-label="Tempo"
				viewBox="0 0 107 25"
				{...styles.wordmark({ className })}
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

	export function NetworkStatusDot(
		props: NetworkStatusDot.Props,
	): React.JSX.Element {
		const { tone } = props
		return (
			<span aria-hidden {...styles.dotRoot()}>
				<span {...styles.dotPing({ tone })} />
				<span {...styles.dot({ tone })} />
			</span>
		)
	}

	export namespace NetworkStatusDot {
		export interface Props {
			tone: 'positive' | 'warning'
		}
	}
}

// Floating panels use the TDS popover elevation.
const panelShadow = {
	boxShadow: `0 1px 2px ${vars.color.shadow.secondary}, 0 8px 24px ${vars.color.shadow.primary}`,
} as const

namespace styles {
	export const header = style({
		containerType: 'inline-size',
		position: 'relative',
		zIndex: 1,
	})

	export const bar = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
		minHeight: '64',
		paddingInline: 'page.margin',
		paddingTop: '32',
		position: 'relative',
		userSelect: 'none',
		zIndex: 20,
		'@container (width >= 800px) and (width < 1239px)': {
			height: '88px !custom',
		},
		'@container (width >= 1240px)': { paddingTop: '48' },
		'@media print': { justifyContent: 'center' },
	})

	export const brand = style({
		alignItems: 'center',
		display: 'flex',
		gap: '12',
		height: '32',
		position: 'relative',
		zIndex: 1,
	})

	export const homeLink = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		gap: '12',
		paddingBlock: '4',
	})

	export const actions = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		position: 'relative',
		zIndex: 1,
		'@media print': { display: 'none' },
	})

	// A link in the TDS small secondary Button style. Below 800px only the
	// icon shows, so the pill collapses to a circle.
	export const simulate = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderRadius: 'full',
		color: 'content.primary',
		display: 'flex',
		gap: '4',
		height: '32',
		justifyContent: 'center',
		paddingInline: '12',
		textDecorationLine: 'none',
		typography: 'body.b3',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
		'@container (width < 799px)': { paddingInline: 'none', width: '32' },
	})

	export const simulateIcon = style({
		flexShrink: 0,
		height: '14px !custom',
		width: '14px !custom',
	})

	export const simulateLabel = style({
		'@container (width < 799px)': { display: 'none' },
	})

	export const searchCompact = style({
		paddingBottom: '12',
		paddingInline: '16',
		paddingTop: '16',
		position: 'sticky',
		top: '0px !custom',
		zIndex: 10,
		'@container (width >= 800px)': { display: 'none' },
		'@media print': { display: 'none' },
	})

	export const searchCentered = style({
		alignItems: 'center',
		display: 'flex',
		height: 'none',
		justifyContent: 'center',
		left: '0px !custom',
		position: 'absolute',
		right: '0px !custom',
		zIndex: 1,
		'@container (width < 1239px)': { display: 'none' },
		'@media print': { display: 'none' },
	})

	export const searchInline = style({
		display: 'flex',
		flex: 1,
		justifyContent: 'center',
		paddingInline: '24',
		'@container (width < 799px)': { display: 'none' },
		'@container (width >= 1240px)': { display: 'none' },
		'@media print': { display: 'none' },
	})

	export const network = style({ position: 'relative' })

	export const networkTrigger = style({
		flexShrink: 0,
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
	})

	export const networkChevron = variants({
		base: {
			color: 'content.tertiary',
			height: '12px !custom',
			transitionDuration: '100ms',
			transitionProperty: 'transform, translate, scale, rotate',
			transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
			width: '12px !custom',
		},
		defaultVariants: { open: false },
		variants: { open: { true: { rotate: '180deg' }, false: {} } },
	})

	export const networkMenu = style({
		...panelShadow,
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		left: '0px !custom',
		overflow: 'hidden',
		padding: '4',
		position: 'absolute',
		top: 'calc(100% + 8px) !custom',
		width: '160px !custom',
		zIndex: 50,
	})

	export const networkOption = variants({
		base: {
			alignItems: 'center',
			borderRadius: '2xs',
			color: 'content.secondary',
			display: 'flex',
			gap: '8',
			paddingBlock: '8',
			paddingInline: '12',
			textDecorationLine: 'none',
			typography: 'body.b2',
			'@media (hover: hover)': {
				':hover': {
					backgroundColor: 'container.regular',
					color: 'content.primary',
				},
			},
		},
		defaultVariants: { active: false },
		variants: {
			active: {
				true: {
					backgroundColor: 'container.regular',
					color: 'content.primary',
				},
				false: {},
			},
		},
	})

	export const blockNumber = variants({
		base: {
			alignItems: 'center',
			color: 'content.secondary',
			display: 'flex',
			gap: '8',
			textDecorationLine: 'none',
			transformOrigin: 'right',
			transitionDuration: '80ms',
			transitionProperty: 'opacity, scale',
			transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
			typography: 'body.b2',
		},
		defaultVariants: { narrow: 'shown', ready: false },
		variants: {
			ready: {
				true: { opacity: 1, scale: 1 },
				false: { opacity: 0, scale: 0.97 },
			},
			narrow: {
				hidden: { '@container (width < 399px)': { display: 'none' } },
				shown: {},
			},
		},
	})

	export const blockNumberIcon = style({
		flexShrink: 0,
		height: '18px !custom',
		width: '18px !custom',
	})

	export const blockNumberText = style({ whiteSpace: 'nowrap' })

	export const blockNumberValue = style({
		color: 'content.primary',
		display: 'inline-block',
		fontVariantNumeric: 'tabular-nums',
		minWidth: '6ch !custom',
	})

	export const wordmark = style({
		color: 'content.primary',
		fill: 'currentColor !custom',
		height: '24',
		width: 'auto !custom',
	})

	export const dotRoot = style({
		display: 'flex',
		flexShrink: 0,
		height: '8',
		position: 'relative',
		width: '8',
	})

	export const dotPing = variants({
		base: {
			animation: `${ping} 1s cubic-bezier(0, 0, 0.2, 1) infinite`,
			borderRadius: 'full',
			display: 'inline-flex',
			height: '100% !custom',
			opacity: 0.6,
			position: 'absolute',
			width: '100% !custom',
		},
		defaultVariants: { tone: 'warning' },
		variants: {
			tone: {
				positive: { backgroundColor: 'content.positive' },
				warning: { backgroundColor: 'content.warning' },
			},
		},
	})

	export const dot = variants({
		base: {
			borderRadius: 'full',
			display: 'inline-flex',
			height: '8',
			position: 'relative',
			width: '8',
		},
		defaultVariants: { tone: 'warning' },
		variants: {
			tone: {
				positive: { backgroundColor: 'content.positive' },
				warning: { backgroundColor: 'content.warning' },
			},
		},
	})
}
