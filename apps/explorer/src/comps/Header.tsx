import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { TempoLogoWordmark } from '@tempoxyz/ds/brand/logos'
import {
	Button,
	StatusIndicator,
	style,
	Tooltip,
	variants,
	vars,
} from '@tempoxyz/ds/platform'
import { ChevronDown } from '@tempoxyz/ds/platform/icons'
import * as React from 'react'
import { cx } from 'zyzz'
import { ExploreInput } from '#comps/ExploreInput'
import { LiveIndicator } from '#comps/ui/LiveIndicator'
import { useAnimatedBlockNumber, useLiveBlockNumber } from '#lib/block-number'
import { type TempoEnv, getTempoEnv, isTestnet } from '#lib/env'
import {
	buildExplorerNetworkHref,
	EXPLORER_NETWORK_OPTIONS,
	getActiveExplorerNetworkOption,
	isExplorerNetworkPathPreservable,
} from '#lib/explorer-network'
import { useIsNotFoundPage } from '#lib/not-found'
import { link, pressDown, transitionColors } from '#styles/explorer'
import FlaskConicalIcon from '~icons/lucide/flask-conical'
import SquareSquare from '~icons/lucide/square-square'

export function Header(): React.JSX.Element {
	const tempoEnv = getTempoEnv()

	return (
		<header {...styles.header()}>
			<div {...styles.bar()}>
				<div {...styles.brand()}>
					<Link to="/" {...cx(styles.homeLink(), pressDown())}>
						<TempoLogoWordmark aria-label="Tempo" {...styles.wordmark()} />
					</Link>
					<Header.NetworkBadge tempoEnv={tempoEnv} />
				</div>
				<Header.Search />
				<div {...styles.actions()}>
					<Tooltip content="Simulate transaction">
						<Link
							to="/simulate"
							aria-label="Simulate transaction"
							{...cx(styles.simulate(), pressDown())}
						>
							<FlaskConicalIcon aria-hidden {...styles.simulateIcon()} />
							<span {...styles.simulateLabel()}>Simulate</span>
						</Link>
					</Tooltip>
					<Header.BlockNumber />
				</div>
			</div>
			<Header.Search compact />
		</header>
	)
}

export namespace Header {
	export function Search(props: Search.Props): React.JSX.Element | null {
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

		const onActivate: ExploreInput.Props['onActivate'] = (data) => {
			if (data.type === 'block')
				navigate({ to: '/block/$id', params: { id: data.value } })
			else if (data.type === 'hash')
				navigate({ to: '/receipt/$hash', params: { hash: data.value } })
			else if (data.type === 'token')
				navigate({ to: '/token/$address', params: { address: data.value } })
			else
				navigate({ to: '/address/$address', params: { address: data.value } })
		}

		if (compact)
			return (
				<div {...styles.searchCompact()}>
					<ExploreInput
						wide
						value={inputValue}
						onChange={setInputValue}
						onActivate={onActivate}
					/>
				</div>
			)

		return (
			<>
				<div {...styles.searchCentered()}>
					<ExploreInput
						value={inputValue}
						onChange={setInputValue}
						onActivate={onActivate}
					/>
				</div>
				<div {...styles.searchInline()}>
					<ExploreInput
						wide
						value={inputValue}
						onChange={setInputValue}
						onActivate={onActivate}
					/>
				</div>
			</>
		)
	}

	export namespace Search {
		export interface Props {
			/** The full-width row shown under the bar on narrow headers. */
			compact?: boolean | undefined
		}
	}

	/** Network switcher: a disclosure button and a list of network links. */
	export function NetworkBadge(props: NetworkBadge.Props): React.JSX.Element {
		const { tempoEnv } = props
		const [isOpen, setIsOpen] = React.useState(false)
		const listId = React.useId()
		const rootRef = React.useRef<HTMLDivElement>(null)
		const triggerRef = React.useRef<HTMLButtonElement>(null)
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
				if (event.key !== 'Escape') return
				setIsOpen(false)
				if (rootRef.current?.contains(document.activeElement))
					triggerRef.current?.focus()
			}

			function handleFocusOut(event: FocusEvent) {
				const next = event.relatedTarget as Node | null
				if (next && !rootRef.current?.contains(next)) setIsOpen(false)
			}

			const root = rootRef.current
			window.addEventListener('pointerdown', handlePointerDown)
			window.addEventListener('keydown', handleKeyDown)
			root?.addEventListener('focusout', handleFocusOut)

			return () => {
				window.removeEventListener('pointerdown', handlePointerDown)
				window.removeEventListener('keydown', handleKeyDown)
				root?.removeEventListener('focusout', handleFocusOut)
			}
		}, [isOpen])

		return (
			<div ref={rootRef} {...styles.network()}>
				{/* The local style only adds what Button leaves unset. */}
				<Button
					ref={triggerRef}
					type="button"
					aria-controls={isOpen ? listId : undefined}
					aria-expanded={isOpen}
					aria-label={`Network: ${activeOption.label}`}
					scale="small"
					variant="secondary"
					{...cx(styles.networkTrigger(), transitionColors(), pressDown())}
					onClick={() => setIsOpen((value) => !value)}
				>
					<LiveIndicator tone={activeOption.dotTone} pinging>
						{activeOption.label}
					</LiveIndicator>
					<ChevronDown {...styles.networkChevron({ open: isOpen })} />
				</Button>
				{isOpen && (
					<ul id={listId} {...styles.networkList()}>
						{EXPLORER_NETWORK_OPTIONS.map((option) => {
							const isActive = option.env === activeOption.env

							return (
								<li key={option.env}>
									<a
										href={buildExplorerNetworkHref(option.host, currentPath, {
											fallbackToHome:
												isNotFoundPage &&
												!isExplorerNetworkPathPreservable(currentPath),
										})}
										aria-current={isActive ? 'page' : undefined}
										{...cx(styles.networkOption(), transitionColors())}
										onClick={() => setIsOpen(false)}
									>
										<StatusIndicator tone={option.dotTone}>
											{option.label}
										</StatusIndicator>
									</a>
								</li>
							)
						})}
					</ul>
				)}
			</div>
		)
	}

	export namespace NetworkBadge {
		export interface Props {
			tempoEnv: TempoEnv
		}
	}

	/** Live block number; hidden when the header is narrower than 400px. */
	export function BlockNumber(): React.JSX.Element {
		const resolvedPathname = useRouterState({
			select: (state) =>
				state.resolvedLocation?.pathname ?? state.location.pathname,
		})
		const optimisticBlockNumber = useAnimatedBlockNumber()
		const liveBlockNumber = useLiveBlockNumber()
		const blockNumber =
			resolvedPathname === '/blocks' ? liveBlockNumber : optimisticBlockNumber
		const isReady = blockNumber != null

		return (
			<Link
				disabled={!isTestnet()}
				to="/block/$id"
				params={{ id: blockNumber != null ? String(blockNumber) : 'latest' }}
				aria-label={
					blockNumber != null ? `Latest block ${blockNumber}` : 'Latest block'
				}
				{...cx(styles.blockNumber({ ready: isReady }), pressDown())}
			>
				<SquareSquare aria-hidden {...cx(styles.blockNumberIcon(), link())} />
				<span {...styles.blockNumberValue()}>
					{blockNumber != null ? String(blockNumber) : '…'}
				</span>
			</Link>
		)
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
		paddingBlock: '4',
	})

	// TDS draws the wordmark in black.
	export const wordmark = style({
		height: '24',
		width: 'auto !custom',
		selectors: { '& path': { fill: 'currentColor !custom' } },
	})

	export const actions = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		position: 'relative',
		zIndex: 1,
		'@media print': { display: 'none' },
	})

	// TDS Button small secondary geometry on a link. Below 800px only the
	// icon shows, as an IconButton small.
	export const simulate = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderRadius: 'full',
		color: 'content.primary',
		columnGap: '4',
		display: 'inline-flex',
		height: '32',
		justifyContent: 'center',
		minWidth: '80px !custom',
		paddingInline: '16',
		textDecorationLine: 'none',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
		'@container (width < 799px)': {
			minWidth: '0px !custom',
			paddingInline: 'none',
			width: '32',
		},
	})

	export const simulateIcon = style({
		flexShrink: 0,
		'@container (width < 799px)': { height: '16', width: '16' },
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
			color: 'content.secondary',
			flexShrink: 0,
			transitionDuration: '100ms',
			transitionProperty: 'rotate',
			transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
		},
		defaultVariants: { open: false },
		variants: { open: { true: { rotate: '180deg' }, false: {} } },
	})

	export const networkList = style({
		...panelShadow,
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		left: '0px !custom',
		listStyle: 'none',
		margin: 'none',
		padding: '4',
		position: 'absolute',
		top: 'calc(100% + 8px) !custom',
		width: '160px !custom',
		zIndex: 50,
	})

	export const networkOption = style({
		alignItems: 'center',
		borderRadius: '2xs',
		display: 'flex',
		paddingBlock: '4',
		paddingInline: '12',
		textDecorationLine: 'none',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
		selectors: {
			'&[aria-current="page"]': { backgroundColor: 'container.regular' },
		},
	})

	export const blockNumber = variants({
		base: {
			alignItems: 'center',
			color: 'content.primary',
			display: 'flex',
			gap: '8',
			textDecorationLine: 'none',
			transformOrigin: 'right',
			transitionDuration: '80ms',
			transitionProperty: 'opacity, scale',
			transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
			typography: 'body.b2',
			'@container (width < 399px)': { display: 'none' },
		},
		defaultVariants: { ready: false },
		variants: {
			ready: {
				true: { opacity: 1, scale: 1 },
				false: { opacity: 0, scale: 0.97 },
			},
		},
	})

	export const blockNumberIcon = style({
		flexShrink: 0,
		height: '16',
		width: '16',
	})

	export const blockNumberValue = style({
		display: 'inline-block',
		fontVariantNumeric: 'tabular-nums',
		minWidth: '6ch !custom',
		whiteSpace: 'nowrap',
	})
}
