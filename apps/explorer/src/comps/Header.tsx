import {
	Link,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import {
	Button,
	Container,
	Menu,
	style,
	Tag,
	Tooltip,
	variants,
} from '@tempoxyz/ds'
import { ChevronDown } from '@tempoxyz/ds/icons'
import * as React from 'react'
import { cx } from 'zyzz'
import { ExploreInput } from '#comps/ExploreInput'
import { TempoWordmark } from '#comps/TempoWordmark'
import { useAnimatedBlockNumber, useLiveBlockNumber } from '#lib/block-number'
import { type TempoEnv, getTempoEnv, isTestnet } from '#lib/env'
import {
	buildExplorerNetworkHref,
	EXPLORER_NETWORK_OPTIONS,
	getActiveExplorerNetworkOption,
	isExplorerNetworkPathPreservable,
} from '#lib/explorer-network'
import { useIsNotFoundPage } from '#lib/not-found'
import { link } from '#styles/explorer'
import FlaskConicalIcon from '~icons/lucide/flask-conical'
import SquareSquare from '~icons/lucide/square-square'

export function Header(): React.JSX.Element {
	const tempoEnv = getTempoEnv()
	// The landing page shows the wordmark above its search instead.
	const isHome = useRouterState({
		select: (state) =>
			(state.resolvedLocation?.pathname ?? state.location.pathname) === '/',
	})

	return (
		<header {...styles.header()}>
			<Container size="full" {...styles.bar()}>
				<div {...styles.brand()}>
					{!isHome && (
						<Link to="/" {...styles.homeLink()}>
							<TempoWordmark aria-label="Tempo" {...styles.wordmark()} />
						</Link>
					)}
					<Header.NetworkBadge tempoEnv={tempoEnv} />
				</div>
				<Header.Search />
				<div {...styles.actions()}>
					<Tooltip.Root>
						<Tooltip.Trigger
							render={
								<Button.Link
									aria-label="Simulate transaction"
									render={<Link to="/simulate" />}
									size="small"
									variant="secondary"
								/>
							}
						>
							<FlaskConicalIcon aria-hidden />
							<span {...styles.simulateLabel()}>Simulate</span>
						</Tooltip.Trigger>
						<Tooltip.Popup>Simulate transaction</Tooltip.Popup>
					</Tooltip.Root>
					<Header.BlockNumber />
				</div>
			</Container>
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

	/** Network switcher: a TDS menu of links to the other explorers. */
	export function NetworkBadge(props: NetworkBadge.Props): React.JSX.Element {
		const { tempoEnv } = props
		const activeOption = getActiveExplorerNetworkOption(tempoEnv)
		const isNotFoundPage = useIsNotFoundPage()
		const currentPath = useRouterState({
			select: (state) => {
				const location = state.resolvedLocation ?? state.location
				const hash = location.hash ? `#${location.hash.replace(/^#/, '')}` : ''
				return `${location.pathname}${location.searchStr}${hash}`
			},
		})

		return (
			<Menu.Root>
				<Menu.Trigger
					render={
						<Button
							aria-label={`Network: ${activeOption.label}`}
							size="small"
							variant="secondary"
							{...styles.networkTrigger()}
						/>
					}
				>
					<Tag intent={activeOption.dotTone} size="small" variant="plain">
						<Tag.Dot />
						{activeOption.label}
					</Tag>
					<ChevronDown {...styles.networkChevron()} />
				</Menu.Trigger>
				<Menu.Popup align="start" size="small">
					{EXPLORER_NETWORK_OPTIONS.map((option) => (
						<Menu.LinkItem
							key={option.env}
							aria-current={
								option.env === activeOption.env ? 'page' : undefined
							}
							closeOnClick
							href={buildExplorerNetworkHref(option.host, currentPath, {
								fallbackToHome:
									isNotFoundPage &&
									!isExplorerNetworkPathPreservable(currentPath),
							})}
						>
							<Tag intent={option.dotTone} size="small" variant="plain">
								<Tag.Dot />
								{option.label}
							</Tag>
						</Menu.LinkItem>
					))}
				</Menu.Popup>
			</Menu.Root>
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
				{...styles.blockNumber({ ready: isReady })}
			>
				<SquareSquare aria-hidden {...cx(styles.blockNumberIcon(), link())} />
				<span {...styles.blockNumberValue()}>
					{blockNumber != null ? String(blockNumber) : '…'}
				</span>
			</Link>
		)
	}
}

namespace styles {
	export const header = style({
		containerType: 'inline-size',
		position: 'relative',
		zIndex: '1 !custom',
	})

	export const bar = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
		minHeight: '64',
		paddingTop: '32',
		position: 'relative',
		userSelect: 'none',
		zIndex: '20 !custom',
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
		zIndex: '1 !custom',
	})

	export const homeLink = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		paddingBlock: '4',
	})

	export const wordmark = style({
		height: '24',
		width: 'auto !custom',
	})

	export const actions = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		position: 'relative',
		zIndex: '1 !custom',
		'@media print': { display: 'none' },
	})

	// Below 800px only the Button's icon shows.
	export const simulateLabel = style({
		'@container (width < 799px)': { display: 'none' },
	})

	export const searchCompact = style({
		paddingBottom: '12',
		paddingInline: '16',
		paddingTop: '16',
		position: 'sticky',
		top: '0',
		zIndex: '10 !custom',
		'@container (width >= 800px)': { display: 'none' },
		'@media print': { display: 'none' },
	})

	export const searchCentered = style({
		alignItems: 'center',
		display: 'flex',
		height: '0',
		justifyContent: 'center',
		left: '0',
		position: 'absolute',
		right: '0',
		zIndex: '1 !custom',
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

	export const networkTrigger = style({ flexShrink: 0 })

	export const networkChevron = style({
		color: 'gray.900',
		flexShrink: 0,
		transitionDuration: '100',
		transitionProperty: 'rotate',
		transitionTimingFunction: 'in-out',
		selectors: { '[data-popup-open] &': { rotate: '180deg' } },
	})

	export const blockNumber = variants({
		base: {
			alignItems: 'center',
			color: 'foreground',
			display: 'flex',
			gap: '8',
			textDecorationLine: 'none',
			transformOrigin: 'right',
			transitionDuration: '100',
			transitionProperty: 'opacity, scale',
			transitionTimingFunction: 'in-out',
			typography: 'copy.14',
			'@container (width < 399px)': { display: 'none' },
		},
		defaultVariants: { ready: false },
		variants: {
			ready: {
				true: { opacity: '1 !custom', scale: '1 !custom' },
				false: { opacity: '0 !custom', scale: 'enter' },
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
