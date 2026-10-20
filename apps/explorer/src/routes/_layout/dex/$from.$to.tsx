import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
	useRouterState,
} from '@tanstack/react-router'
import { Button, Callout, style, variants } from '@tempoxyz/ds'
import {
	ArrowRight,
	ChevronLeft,
	Refresh,
	SwapHorizontal,
} from '@tempoxyz/ds/icons'
import { useEffect, useId, useRef, useState } from 'react'
import type * as React from 'react'
import { cx } from 'zyzz'
import { CopyButton } from '#comps/CopyButton'
import { DexSwapsGrid, LivePill, useDexSwaps } from '#comps/DexSwaps'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import {
	defaultDexRoute,
	depthTicks,
	dexRouteParamsSchema,
	dexRouteSearchSchema,
	parseRouteAmount,
	quoteImpact,
	type DexQuote,
	type DexToken,
} from '#lib/dex-route'
import { useMediaQuery } from '#lib/hooks'
import {
	dexLegDepthQueryOptions,
	dexRouteQueryOptions,
} from '#lib/queries/dex-route'
import type { DexDepthLevel, DexLeg } from '#lib/server/dex-route'
import {
	link,
	linkHover,
	mono,
	pressDown,
	transitionColors,
} from '#styles/explorer'
import { getTempoChain } from '#wagmi.config'

export const Route = createFileRoute('/_layout/dex/$from/$to')({
	component: DexRoutePage,
	params: {
		parse: (params) => dexRouteParamsSchema.parse(params),
		stringify: (params) => params,
	},
	validateSearch: dexRouteSearchSchema,
	search: {
		middlewares: [stripSearchParams({ amount: defaultDexRoute.amount })],
	},
	errorComponent: () => (
		<div {...styles.error()}>
			<h1 {...styles.errorTitle()}>Invalid route link</h1>
			<p {...styles.secondary()}>
				Use two token addresses and a positive decimal amount.
			</p>
			<Link
				to="/dex/$from/$to"
				params={{ from: defaultDexRoute.from, to: defaultDexRoute.to }}
				{...cx(link(), linkHover())}
			>
				View USDT0 → pathUSD
			</Link>
		</div>
	),
	head: () => ({ meta: [{ title: 'Stablecoin DEX – Tempo Explorer' }] }),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps, params }) =>
		context.queryClient.prefetchQuery(
			dexRouteQueryOptions({ ...params, ...deps }),
		),
})

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
const rate = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })
const bps = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const size = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const mainnetSymbols: Record<string, string> = {
	'0x20c00000000000000000000014f22ca97301eb73': 'USDT0',
	'0x20c0000000000000000000000000000000000000': 'pathUSD',
}

function formatAmount(value: string): string {
	const numeric = Number(value)
	return numeric > 0 && numeric < 0.000001 ? value : number.format(numeric)
}

function quoteMessage(quote: DexQuote): string {
	return quote.status === 'no-liquidity'
		? 'Insufficient liquidity for this amount'
		: 'Quote unavailable'
}

function DexRoutePage(): React.JSX.Element {
	const params = Route.useParams()
	const search = { ...params, ...Route.useSearch() }
	const query = useQuery(dexRouteQueryOptions(search))
	const isMobile = useMediaQuery('(max-width: 799px)')
	const [section, setSection] = useState(0)
	const [live, setLive] = useState(true)
	const [paused, setPaused] = useState(false)
	// Poll only while the feed is on screen.
	const swaps = useDexSwaps(
		live && !paused && (isMobile || section === 1),
		// Someone who opened this pair wants its swaps, verified or not.
		{
			path: query.data?.path.map((token) => token.address),
			bases: query.data?.legs.map((leg) => leg.base.address),
			unverified: true,
		},
		Boolean(query.data),
	)
	const snapshot = query.data
	const from = snapshot?.path[0]
	const to = snapshot?.path[snapshot.path.length - 1]
	const impact = snapshot
		? quoteImpact(snapshot.quote, snapshot.reference)
		: null
	const mainnet = getTempoChain().id === 4217

	return (
		<div {...styles.page()}>
			<div {...styles.header()}>
				<div {...styles.intro()}>
					<Link to="/dex" {...cx(styles.back(), transitionColors())}>
						<ChevronLeft aria-hidden="true" {...styles.backIcon()} />
						Stablecoin DEX
					</Link>
					<h1 {...styles.title()}>
						{from && to ? (
							<>
								<span {...styles.titleToken()}>
									<TokenIcon address={from.address} size={28} />
									{from.symbol}
								</span>
								<span {...styles.titleToken()}>
									<ArrowRight aria-hidden="true" {...styles.titleArrow()} />
									<TokenIcon address={to.address} size={28} />
									{to.symbol}
								</span>
							</>
						) : (
							<>
								{mainnet
									? (mainnetSymbols[search.from] ?? 'Input token')
									: 'Input token'}
								<ArrowRight aria-hidden="true" {...styles.titleArrow()} />
								{mainnet
									? (mainnetSymbols[search.to] ?? 'Output token')
									: 'Output token'}
							</>
						)}
					</h1>
					{query.isError && !snapshot && (
						<dl {...styles.unresolved()}>
							<div>
								<dt {...styles.secondary()}>Input token</dt>
								<dd {...cx(mono(), styles.breakAll())}>{search.from}</dd>
							</div>
							<div>
								<dt {...styles.secondary()}>Output token</dt>
								<dd {...cx(mono(), styles.breakAll())}>{search.to}</dd>
							</div>
						</dl>
					)}
				</div>
				<CopyButton
					value={() => window.location.href}
					ariaLabel="Copy route link"
				>
					Copy link
				</CopyButton>
			</div>

			<section aria-label="Route and quote" {...styles.quote()}>
				{query.isError && !snapshot ? (
					<div {...styles.alert()}>
						<Callout intent="negative">
							<Callout.Icon />
							<Callout.Content>{query.error.message}</Callout.Content>
							<Callout.Action
								disabled={query.isFetching}
								onClick={() => void query.refetch()}
							>
								{query.isFetching ? 'Retrying…' : 'Try again'}
							</Callout.Action>
						</Callout>
					</div>
				) : query.isPending ? (
					<p role="status" {...styles.status()}>
						Loading the token path and live quotes…
					</p>
				) : (
					snapshot &&
					from &&
					to && (
						<>
							{snapshot.path.length > 2 && (
								<ol aria-label="Token path" {...styles.path()}>
									{snapshot.path.map((token, index) => (
										<li key={token.address} {...styles.pathItem()}>
											{index > 0 && (
												<ArrowRight aria-hidden="true" {...styles.arrow()} />
											)}
											<TokenLink token={token} />
										</li>
									))}
								</ol>
							)}
							<div {...styles.panels()}>
								<div {...styles.payPanel()}>
									<AmountInput
										key={`${search.from}:${search.to}`}
										amount={search.amount}
										token={from}
										inputError={snapshot.inputError}
									/>
									{/* Sits on the divider: below the pay panel when stacked,
									    and level with the amounts side by side. */}
									<Link
										to="/dex/$from/$to"
										params={{ from: search.to, to: search.from }}
										search={{ amount: search.amount }}
										aria-label="Reverse route"
										title="Reverse route"
										{...cx(styles.reverse(), transitionColors(), pressDown())}
									>
										<SwapHorizontal
											aria-hidden="true"
											{...styles.reverseIcon()}
										/>
									</Link>
								</div>
								<div
									{...styles.receivePanel()}
									aria-live="polite"
									aria-busy={query.isFetching}
								>
									<div {...styles.panelLabel()}>You receive</div>
									<div {...styles.amountRow()}>
										{snapshot.quote.amountOut !== null ? (
											<div
												{...styles.amountOut({ fetching: query.isFetching })}
											>
												{formatAmount(snapshot.quote.amountOut)}
											</div>
										) : (
											<p {...styles.quoteMessage()}>
												{snapshot.inputError
													? 'Enter a valid amount'
													: quoteMessage(snapshot.quote)}
											</p>
										)}
										<TokenBadge token={to} />
									</div>
									{snapshot.quote.amountOut !== null && (
										<dl {...styles.facts()}>
											<div {...styles.fact()}>
												<dt {...styles.secondary()}>Rate</dt>
												<dd {...styles.factValue()}>
													1 {from.symbol} ={' '}
													{rate.format(
														Number(snapshot.quote.amountOut) /
															Number(snapshot.quote.amountIn),
													)}{' '}
													{to.symbol}
												</dd>
											</div>
											<div {...styles.fact()}>
												<dt
													{...styles.secondary()}
													title={`Compared with the rate for 1 ${from.symbol} at the same block`}
												>
													Price impact
												</dt>
												<dd {...styles.factValue()}>
													{impact === null ? '—' : `${bps.format(impact)} bps`}
												</dd>
											</div>
										</dl>
									)}
								</div>
							</div>
							<div {...styles.footer()}>
								<Link
									to="/block/$id"
									params={{ id: snapshot.blockNumber }}
									{...cx(styles.blockLink(), transitionColors())}
								>
									Block {snapshot.blockNumber}
								</Link>
								<Button
									onClick={() => void query.refetch()}
									loading={query.isFetching}
									aria-label="Refresh quote"
									size="small"
									variant="text"
								>
									<Refresh aria-hidden="true" {...styles.refreshIcon()} />
									Refresh
								</Button>
							</div>
							{query.isRefetchError && (
								<p role="alert" {...styles.refreshError()}>
									Refresh failed. Showing the previous block’s snapshot.
								</p>
							)}
						</>
					)
				)}
			</section>

			{snapshot && from && to && (
				<Sections
					mode={isMobile ? 'stacked' : 'tabs'}
					activeSection={section}
					onSectionChange={setSection}
					sections={[
						{
							title: snapshot.legs.length === 1 ? 'Order book' : 'Order books',
							autoCollapse: false,
							content: (
								<div {...styles.legs()}>
									{snapshot.legs.map((leg, index) => (
										<LegRow
											key={`${leg.from.address}:${leg.to.address}`}
											blockNumber={snapshot.blockNumber}
											index={snapshot.legs.length > 1 ? index : undefined}
											leg={leg}
										/>
									))}
								</div>
							),
						},
						{
							title: 'Swaps',
							autoCollapse: false,
							contextual: (
								<LivePill
									live={live && !paused}
									onToggle={() => setLive(!live)}
								/>
							),
							content:
								swaps.isError && !swaps.data ? (
									<p role="alert" {...styles.status()}>
										{swaps.error.message}
									</p>
								) : (
									// biome-ignore lint/a11y/noStaticElementInteractions: pause on hover
									<div
										onMouseEnter={() => setPaused(true)}
										onMouseLeave={() => setPaused(false)}
									>
										<DexSwapsGrid
											swaps={swaps.data ?? []}
											loading={swaps.isPending}
											live={live && !paused}
											base={
												snapshot.legs.length === 1
													? snapshot.legs[0]?.base.address
													: from.address
											}
										/>
									</div>
								),
						},
						{
							title: 'Details',
							content: (
								<dl {...styles.details()}>
									{snapshot.path.map((token) => (
										<div key={token.address} {...styles.detail()}>
											<dt {...styles.detailToken()}>
												<TokenIcon address={token.address} size={20} />
												{token.symbol}
											</dt>
											<dd {...styles.detailAddress()}>
												<Link
													to="/address/$address"
													params={{ address: token.address }}
													{...cx(
														link(),
														linkHover(),
														mono(),
														styles.breakAll(),
													)}
												>
													{token.address}
												</Link>
											</dd>
										</div>
									))}
								</dl>
							),
						},
					]}
				/>
			)}
		</div>
	)
}

export function AmountInput(props: AmountInput.Props): React.JSX.Element {
	const { amount, token, inputError } = props
	const navigate = Route.useNavigate()
	const isNavigating = useRouterState({
		select: (state) => state.status === 'pending',
	})
	const amountId = useId()
	const [draft, setDraft] = useState(amount)
	const [validationError, setValidationError] = useState<string | null>(null)
	const submittedAmount = useRef(amount)

	useEffect(() => {
		// Keep newer typing when an earlier quote finishes loading.
		if (amount !== submittedAmount.current) setDraft(amount)
		submittedAmount.current = amount
	}, [amount])

	useEffect(() => {
		if (isNavigating) return
		const timeout = setTimeout(() => {
			const value = draft.trim()
			try {
				parseRouteAmount(value, token.decimals)
			} catch (error) {
				setValidationError(
					error instanceof Error ? error.message : 'Invalid amount.',
				)
				return
			}
			setValidationError(null)
			if (value === amount) return
			submittedAmount.current = value
			void navigate({ search: { amount: value }, replace: true })
		}, 250)
		return () => clearTimeout(timeout)
	}, [draft, amount, token.decimals, navigate, isNavigating])

	const error = validationError || (draft.trim() === amount ? inputError : null)

	return (
		<div {...styles.payFields()}>
			<label htmlFor={amountId} {...styles.panelLabel()}>
				You pay
			</label>
			<div {...styles.amountRow()}>
				<input
					id={amountId}
					name="amount"
					inputMode="decimal"
					autoComplete="off"
					placeholder="0"
					value={draft}
					onChange={(event) => {
						setDraft(event.target.value)
						setValidationError(null)
					}}
					aria-invalid={Boolean(error)}
					aria-describedby={error ? `${amountId}-error` : undefined}
					{...styles.amountInput()}
				/>
				<TokenBadge token={token} />
			</div>
			{error && (
				<p id={`${amountId}-error`} role="alert" {...styles.fieldError()}>
					{error}
				</p>
			)}
		</div>
	)
}

export declare namespace AmountInput {
	type Props = {
		amount: string
		token: DexToken
		inputError: string | null
	}
}

function LegRow(props: {
	blockNumber: string
	index: number | undefined
	leg: DexLeg
}): React.JSX.Element {
	const { blockNumber, index, leg } = props
	const depth = useQuery({
		...dexLegDepthQueryOptions({
			from: leg.from.address,
			to: leg.to.address,
			tick: leg.bestTick ?? 0,
			blockNumber,
		}),
		enabled: leg.bestTick !== null,
	})
	const spread =
		leg.bid !== null && leg.ask !== null
			? ((leg.ask - leg.bid) / leg.ask) * 10_000
			: null
	const stats = [
		{ label: 'Bid', value: leg.bid === null ? '—' : leg.bid.toFixed(4) },
		{ label: 'Ask', value: leg.ask === null ? '—' : leg.ask.toFixed(4) },
		{
			label: 'Spread',
			value: spread === null ? '—' : `${bps.format(spread)} bps`,
		},
	]

	return (
		<div {...styles.leg()}>
			<div {...styles.legHeader()}>
				<div {...styles.legTokens()}>
					{index !== undefined && (
						<span {...styles.legIndex()}>{index + 1}</span>
					)}
					<TokenLink token={leg.from} />
					<ArrowRight aria-hidden="true" {...styles.arrow()} />
					<TokenLink token={leg.to} />
				</div>
				{leg.exists ? (
					<dl {...styles.legStats()}>
						{stats.map((stat) => (
							<div key={stat.label} {...styles.legStat()}>
								<dt {...styles.legStatLabel()}>{stat.label}</dt>
								<dd {...styles.legStatValue()}>{stat.value}</dd>
							</div>
						))}
					</dl>
				) : (
					<span {...styles.note()}>Book not created</span>
				)}
			</div>
			{leg.bestTick !== null && (
				<div {...styles.depth()} aria-live="polite">
					{depth.isPending ? (
						<p role="status" {...styles.depthNote()}>
							Loading depth…
						</p>
					) : depth.isError ? (
						<p role="status" {...styles.depthNote()}>
							Depth is unavailable.{' '}
							<button
								type="button"
								onClick={() => void depth.refetch()}
								{...cx(styles.textAction(), transitionColors())}
							>
								Try again
							</button>
						</p>
					) : depth.data.length === 0 ? (
						<p {...styles.depthNote()}>
							No resting orders within {depthTicks} price levels of the best
							price.
						</p>
					) : (
						<DepthLadder levels={depth.data} leg={leg} />
					)}
				</div>
			)}
		</div>
	)
}

/** Each level's bar shows how much of the scanned depth fills by that price. */
function DepthLadder(props: {
	levels: DexDepthLevel[]
	leg: DexLeg
}): React.JSX.Element {
	const { levels, leg } = props
	const total = Number(levels[levels.length - 1]?.cumulativeIn ?? 0)
	// Grid rows let one bar span the whole row; a row's background would
	// repaint per cell.
	return (
		<table {...styles.ladder()}>
			<thead {...styles.ladderSection()}>
				<tr {...cx(styles.ladderRow(), styles.ladderHead())}>
					<th {...styles.cellStart()}>
						Price · {leg.to.symbol} per {leg.from.symbol}
					</th>
					<th {...styles.cellEnd()}>Size · {leg.from.symbol}</th>
					<th {...styles.cellEnd()}>Total · {leg.from.symbol}</th>
				</tr>
			</thead>
			<tbody {...styles.ladderSection()}>
				{levels.map((level) => (
					<tr
						key={level.tick}
						{...cx(styles.ladderRow(), styles.ladderLevel())}
					>
						<td {...styles.price({ bid: leg.isBid })}>
							<span
								aria-hidden="true"
								{...styles.bar({
									bid: leg.isBid,
									style: {
										width: `${total > 0 ? (Number(level.cumulativeIn) / total) * 100 : 0}%`,
									},
								})}
							/>
							<span {...styles.raised()}>{rate.format(level.rate)}</span>
						</td>
						<td {...cx(styles.cellEnd(), styles.raised(), styles.secondary())}>
							{size.format(Number(level.amountIn))}
						</td>
						<td {...cx(styles.cellEnd(), styles.raised(), styles.primary())}>
							{size.format(Number(level.cumulativeIn))}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	)
}

function TokenBadge(props: { token: DexToken }): React.JSX.Element {
	return (
		<Link
			to="/address/$address"
			params={{ address: props.token.address }}
			{...cx(styles.badge(), transitionColors(), pressDown())}
		>
			<TokenIcon address={props.token.address} size={24} />
			{props.token.symbol}
		</Link>
	)
}

function TokenLink(props: { token: DexToken }): React.JSX.Element {
	return (
		<Link
			to="/address/$address"
			params={{ address: props.token.address }}
			{...cx(styles.tokenLink(), transitionColors())}
		>
			<TokenIcon address={props.token.address} size={20} />
			<span {...styles.breakAll()}>{props.token.symbol}</span>
		</Link>
	)
}

// Dashed dividers between panels and rows.
const dashed = {
	borderColor: 'grayAlpha.200',
	borderStyle: 'dashed',
} as const

namespace styles {
	export const page = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '6',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingBottom: '16',
		paddingInline: '4',
		paddingTop: '8',
		width: '100% !custom',
		'@media (width >= 640px)': { paddingTop: '16' },
	})

	export const error = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '3',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingInline: '4',
		paddingTop: '16',
		width: '100% !custom',
	})

	export const errorTitle = style({
		color: 'foreground',
		typography: 'heading.20.subtle',
	})

	export const header = style({
		alignItems: 'flex-start',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '4',
		justifyContent: 'space-between',
	})

	export const intro = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '3',
		minWidth: '0 !custom',
	})

	export const back = style({
		alignItems: 'center',
		alignSelf: 'flex-start',
		color: 'gray.900',
		display: 'inline-flex',
		gap: '1',
		textDecorationLine: 'none',
		typography: 'label.12',
		'@media (hover: hover)': { ':hover': { color: 'foreground' } },
	})

	export const backIcon = style({ height: '4', width: '4' })

	export const title = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '3',
		typography: 'heading.24.subtle',
		'@media (width >= 640px)': { typography: 'heading.32.subtle' },
	})

	export const titleToken = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '3',
		whiteSpace: 'nowrap',
	})

	export const titleArrow = style({
		color: 'gray.900',
		height: '6',
		width: '6',
	})

	export const unresolved = style({
		color: 'gray.900',
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
		typography: 'label.12',
	})

	export const breakAll = style({ wordBreak: 'break-all' })

	export const secondary = style({ color: 'gray.900' })

	export const primary = style({ color: 'foreground' })

	// An unpadded bordered card: TDS `Surface` always pads its content, and the
	// panel dividers run edge to edge.
	export const quote = style({
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: 'xl',
		borderStyle: 'solid',
		borderWidth: '1px',
		boxSizing: 'border-box',
		color: 'foreground',
		overflow: 'hidden',
	})

	export const alert = style({ padding: '4' })

	export const status = style({
		color: 'gray.900',
		padding: '4',
		typography: 'copy.14',
	})

	export const path = style({
		...dashed,
		alignItems: 'center',
		borderBottomWidth: '1px',
		columnGap: '2',
		display: 'flex',
		flexWrap: 'wrap',
		paddingBlock: '3',
		paddingInline: '4',
		rowGap: '3',
	})

	export const pathItem = style({
		alignItems: 'center',
		display: 'flex',
		gap: '2',
		minWidth: '0 !custom',
	})

	export const arrow = style({
		color: 'gray.900',
		flexShrink: 0,
		height: '4',
		width: '4',
	})

	export const panels = style({
		display: 'grid',
		'@media (width >= 768px)': {
			gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
		},
	})

	export const payPanel = style({ position: 'relative' })

	export const payFields = style({
		...dashed,
		borderBottomWidth: '1px',
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		height: '100% !custom',
		padding: '4',
		'@media (width >= 768px)': {
			borderBottomWidth: '0px',
			borderRightWidth: '1px',
			paddingRight: '12',
		},
	})

	// The reverse control straddles the divider between the two panels.
	export const reverse = style({
		alignItems: 'center',
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: 'full',
		borderStyle: 'solid',
		borderWidth: '1px',
		bottom: '0px !custom',
		color: 'gray.900',
		display: 'inline-flex',
		height: '10',
		justifyContent: 'center',
		left: '50% !custom',
		position: 'absolute',
		translate: '-50% 50% !custom',
		width: '10',
		zIndex: 10,
		'@media (hover: hover)': {
			':hover': { borderColor: 'blue.700', color: 'foreground' },
		},
		'@media (width >= 768px)': {
			bottom: 'auto !custom',
			left: 'auto !custom',
			right: '0px !custom',
			top: '81px !custom',
			translate: '50% -50% !custom',
		},
	})

	export const reverseIcon = style({
		height: '4',
		rotate: '90deg',
		width: '4',
		'@media (width >= 768px)': { rotate: '0deg' },
	})

	export const receivePanel = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		padding: '4',
		'@media (width >= 768px)': { paddingLeft: '12' },
	})

	export const panelLabel = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const amountRow = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
		justifyContent: 'space-between',
		minHeight: '12',
	})

	export const amountInput = style({
		backgroundColor: 'transparent !custom',
		border: 'none !custom',
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0 !custom',
		outline: 'none !custom',
		padding: '0',
		typography: 'heading.32.subtle',
		width: '100% !custom',
		'::placeholder': { color: 'gray.900' },
		selectors: { '&[aria-invalid="true"]': { color: 'red.900' } },
	})

	export const amountOut = variants({
		base: {
			color: 'foreground',
			fontVariantNumeric: 'tabular-nums',
			transitionDuration: '150ms !custom',
			transitionProperty: 'opacity',
			typography: 'heading.32.subtle',
			wordBreak: 'break-all',
		},
		defaultVariants: { fetching: false },
		variants: {
			fetching: { true: { opacity: 0.6 }, false: {} },
		},
	})

	export const quoteMessage = style({
		color: 'gray.900',
		typography: 'heading.20.subtle',
	})

	export const facts = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
		typography: 'label.12',
	})

	export const fact = style({
		columnGap: '4',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		rowGap: '1',
	})

	export const factValue = style({
		color: 'gray.900',
		fontVariantNumeric: 'tabular-nums',
	})

	export const fieldError = style({
		color: 'red.900',
		typography: 'label.12',
	})

	// The end inset plus the refresh button's own 12px padding lines its label
	// up with the 16px panel edge.
	export const footer = style({
		...dashed,
		alignItems: 'center',
		borderTopWidth: '1px',
		color: 'gray.900',
		display: 'flex',
		gap: '3',
		justifyContent: 'space-between',
		paddingBlock: '1',
		paddingInlineEnd: '1',
		paddingInlineStart: '4',
		typography: 'label.12',
	})

	export const blockLink = style({
		color: 'gray.900',
		fontVariantNumeric: 'tabular-nums',
		textDecorationLine: 'none',
		'@media (hover: hover)': { ':hover': { color: 'foreground' } },
	})

	export const refreshIcon = style({ height: '4', width: '4' })

	// An unpadded text action inside a line of copy, where a TDS `Button`
	// would add height and padding.
	export const textAction = style({
		backgroundColor: 'transparent !custom',
		border: 'none !custom',
		borderRadius: 'sm',
		color: 'gray.900',
		cursor: 'pointer',
		padding: '0',
		typography: 'label.12.strong',
		'@media (hover: hover)': { ':hover': { color: 'foreground' } },
		selectors: {
			'&:focus-visible': {
				outlineColor: 'blue.700',
				outlineOffset: '2px !custom',
				outlineStyle: 'solid',
				outlineWidth: '2px !custom',
			},
		},
	})

	export const refreshError = style({
		color: 'red.900',
		paddingBottom: '3',
		paddingInline: '4',
		typography: 'label.12',
	})

	export const legs = style({ display: 'flex', flexDirection: 'column' })

	export const leg = style({
		...dashed,
		display: 'flex',
		flexDirection: 'column',
		selectors: { '&:not(:last-child)': { borderBottomWidth: '1px' } },
	})

	export const legHeader = style({
		alignItems: 'center',
		columnGap: '6',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		paddingBlock: '4',
		paddingInline: '4',
		rowGap: '4',
	})

	export const legTokens = style({
		alignItems: 'center',
		display: 'flex',
		gap: '2',
		minWidth: '0 !custom',
	})

	export const legIndex = style({
		alignItems: 'center',
		borderColor: 'grayAlpha.200',
		borderRadius: 'full',
		borderStyle: 'solid',
		borderWidth: '1px',
		color: 'gray.900',
		display: 'inline-flex',
		flexShrink: 0,
		fontVariantNumeric: 'tabular-nums',
		height: '5',
		justifyContent: 'center',
		typography: 'label.12',
		width: '5',
	})

	export const legStats = style({
		columnGap: '8',
		display: 'flex',
		flexWrap: 'wrap',
		rowGap: '3',
	})

	export const legStat = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '1',
	})

	export const legStatLabel = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const legStatValue = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums',
		typography: 'copy.14',
	})

	export const note = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const depth = style({ ...dashed, borderTopWidth: '1px' })

	export const depthNote = style({
		color: 'gray.900',
		paddingBlock: '4',
		paddingInline: '4',
		typography: 'label.12',
	})

	export const ladder = style({
		display: 'block',
		fontVariantNumeric: 'tabular-nums',
		paddingBottom: '2',
		typography: 'label.12',
		whiteSpace: 'nowrap',
		width: '100% !custom',
	})

	export const ladderSection = style({ display: 'block' })

	export const ladderRow = style({
		display: 'grid',
		gap: '4',
		gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
		paddingInline: '4',
	})

	export const ladderHead = style({
		color: 'gray.900',
		paddingBlock: '2',
	})

	export const ladderLevel = style({
		paddingBlock: '1',
		position: 'relative',
	})

	export const cellStart = style({ fontWeight: 'normal', textAlign: 'left' })

	export const cellEnd = style({ fontWeight: 'normal', textAlign: 'right' })

	export const raised = style({ position: 'relative' })

	export const price = variants({
		defaultVariants: { bid: true },
		variants: {
			bid: {
				true: { color: 'green.900' },
				false: { color: 'red.900' },
			},
		},
	})

	export const bar = variants({
		base: {
			bottom: '1px !custom',
			left: '0px !custom',
			position: 'absolute',
			top: '1px !custom',
		},
		defaultVariants: { bid: true },
		variants: {
			bid: {
				true: { backgroundColor: 'green.100' },
				false: { backgroundColor: 'red.100' },
			},
		},
	})

	export const details = style({ display: 'flex', flexDirection: 'column' })

	export const detail = style({
		...dashed,
		alignItems: 'center',
		columnGap: '6',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		paddingBlock: '3',
		paddingInline: '4',
		rowGap: '1',
		selectors: { '&:not(:last-child)': { borderBottomWidth: '1px' } },
	})

	export const detailToken = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'inline-flex',
		fontWeight: 'medium',
		gap: '2',
		typography: 'copy.14',
	})

	export const detailAddress = style({
		minWidth: '0 !custom',
		typography: 'label.12',
	})

	export const badge = style({
		alignItems: 'center',
		backgroundColor: 'background.primary',
		borderColor: 'grayAlpha.200',
		borderRadius: 'full',
		borderStyle: 'solid',
		borderWidth: '1px',
		color: 'foreground',
		display: 'inline-flex',
		flexShrink: 0,
		fontWeight: 'medium',
		gap: '2',
		height: '10',
		paddingLeft: '2',
		paddingRight: '3',
		textDecorationLine: 'none',
		typography: 'copy.14',
		'@media (hover: hover)': { ':hover': { borderColor: 'blue.700' } },
	})

	export const tokenLink = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'inline-flex',
		fontWeight: 'medium',
		gap: '2',
		minWidth: '0 !custom',
		textDecorationLine: 'none',
		typography: 'copy.14',
		'@media (hover: hover)': { ':hover': { color: 'blue.900' } },
	})
}
