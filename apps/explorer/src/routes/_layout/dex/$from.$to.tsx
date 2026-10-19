import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
	useRouterState,
} from '@tanstack/react-router'
import {
	Alert,
	Card,
	Spinner,
	style,
	TextButton,
	variants,
} from '@tempoxyz/ds/platform'
import {
	ArrowRight,
	ChevronLeft,
	Refresh,
	SwapHorizontal,
} from '@tempoxyz/ds/platform/icons'
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

			<Card
				render={<section aria-label="Route and quote" />}
				{...styles.quote()}
			>
				{query.isError && !snapshot ? (
					<div {...styles.alert()}>
						<Alert
							role="alert"
							tone="negative"
							title={query.error.message}
							action={{
								disabled: query.isFetching,
								label: query.isFetching ? 'Retrying…' : 'Try again',
								onClick: () => void query.refetch(),
							}}
						/>
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
								<TextButton
									onClick={() => void query.refetch()}
									disabled={query.isFetching}
									aria-label="Refresh quote"
									{...styles.refresh()}
								>
									{query.isFetching ? (
										<Spinner />
									) : (
										<Refresh aria-hidden="true" {...styles.refreshIcon()} />
									)}
									Refresh
								</TextButton>
							</div>
							{query.isRefetchError && (
								<p role="alert" {...styles.refreshError()}>
									Refresh failed. Showing the previous block’s snapshot.
								</p>
							)}
						</>
					)
				)}
			</Card>

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
							<TextButton onClick={() => void depth.refetch()}>
								Try again
							</TextButton>
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
	borderColor: 'line.secondary',
	borderStyle: 'dashed',
} as const

namespace styles {
	export const page = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '24',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingBottom: '64',
		paddingInline: '16',
		paddingTop: '32',
		width: '100% !custom',
		'@media (width >= 640px)': { paddingTop: '64' },
	})

	export const error = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		marginInline: 'auto !custom',
		maxWidth: '1200px !custom',
		paddingInline: '16',
		paddingTop: '64',
		width: '100% !custom',
	})

	export const errorTitle = style({
		color: 'content.primary',
		typography: 'heading.h3',
	})

	export const header = style({
		alignItems: 'flex-start',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
	})

	export const intro = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '12',
		minWidth: '0 !custom',
	})

	export const back = style({
		alignItems: 'center',
		alignSelf: 'flex-start',
		color: 'content.secondary',
		display: 'inline-flex',
		gap: '4',
		textDecorationLine: 'none',
		typography: 'body.b3',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
	})

	export const backIcon = style({ height: '16', width: '16' })

	export const title = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
		typography: 'heading.h2',
		'@media (width >= 640px)': { typography: 'heading.h1' },
	})

	export const titleToken = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '12',
		whiteSpace: 'nowrap',
	})

	export const titleArrow = style({
		color: 'content.secondary',
		height: '24',
		width: '24',
	})

	export const unresolved = style({
		color: 'content.secondary',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		typography: 'body.b3',
	})

	export const breakAll = style({ wordBreak: 'break-all' })

	export const secondary = style({ color: 'content.secondary' })

	export const primary = style({ color: 'content.primary' })

	export const quote = style({
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		borderWidth: 'regular',
		overflow: 'hidden',
	})

	export const alert = style({ padding: '16' })

	export const status = style({
		color: 'content.secondary',
		padding: '16',
		typography: 'body.b2',
	})

	export const path = style({
		...dashed,
		alignItems: 'center',
		borderBottomWidth: 'regular',
		columnGap: '8',
		display: 'flex',
		flexWrap: 'wrap',
		paddingBlock: '12',
		paddingInline: '16',
		rowGap: '12',
	})

	export const pathItem = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const arrow = style({
		color: 'content.secondary',
		flexShrink: 0,
		height: '16',
		width: '16',
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
		borderBottomWidth: 'regular',
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		height: '100% !custom',
		padding: '16',
		'@media (width >= 768px)': {
			borderBottomWidth: 'none',
			borderRightWidth: 'regular',
			paddingRight: '48',
		},
	})

	// The reverse control straddles the divider between the two panels.
	export const reverse = style({
		alignItems: 'center',
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'full',
		borderStyle: 'solid',
		borderWidth: 'regular',
		bottom: '0px !custom',
		color: 'content.secondary',
		display: 'inline-flex',
		height: '40',
		justifyContent: 'center',
		left: '50% !custom',
		position: 'absolute',
		translate: '-50% 50% !custom',
		width: '40',
		zIndex: 10,
		'@media (hover: hover)': {
			':hover': { borderColor: 'border.accent', color: 'content.primary' },
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
		height: '16',
		rotate: '90deg',
		width: '16',
		'@media (width >= 768px)': { rotate: '0deg' },
	})

	export const receivePanel = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		padding: '16',
		'@media (width >= 768px)': { paddingLeft: '48' },
	})

	export const panelLabel = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const amountRow = style({
		alignItems: 'center',
		display: 'flex',
		gap: '16',
		justifyContent: 'space-between',
		minHeight: '48',
	})

	export const amountInput = style({
		backgroundColor: 'transparent !custom',
		border: 'none !custom',
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0 !custom',
		outline: 'none !custom',
		padding: 'none',
		typography: 'heading.h1',
		width: '100% !custom',
		'::placeholder': { color: 'content.secondary' },
		selectors: { '&[aria-invalid="true"]': { color: 'content.negative' } },
	})

	export const amountOut = variants({
		base: {
			color: 'content.primary',
			fontVariantNumeric: 'tabular-nums',
			transitionDuration: '150ms !custom',
			transitionProperty: 'opacity',
			typography: 'heading.h1',
			wordBreak: 'break-all',
		},
		defaultVariants: { fetching: false },
		variants: {
			fetching: { true: { opacity: 0.6 }, false: {} },
		},
	})

	export const quoteMessage = style({
		color: 'content.secondary',
		typography: 'heading.h3',
	})

	export const facts = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		typography: 'body.b3',
	})

	export const fact = style({
		columnGap: '16',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		rowGap: '4',
	})

	export const factValue = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
	})

	export const fieldError = style({
		color: 'content.negative',
		typography: 'body.b3',
	})

	export const footer = style({
		...dashed,
		alignItems: 'center',
		borderTopWidth: 'regular',
		color: 'content.secondary',
		display: 'flex',
		gap: '12',
		justifyContent: 'space-between',
		paddingBlock: '8',
		paddingInline: '16',
		typography: 'body.b3',
	})

	export const blockLink = style({
		color: 'content.secondary',
		fontVariantNumeric: 'tabular-nums',
		textDecorationLine: 'none',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
	})

	export const refresh = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
	})

	export const refreshIcon = style({ height: '16', width: '16' })

	export const refreshError = style({
		color: 'content.negative',
		paddingBottom: '12',
		paddingInline: '16',
		typography: 'body.b3',
	})

	export const legs = style({ display: 'flex', flexDirection: 'column' })

	export const leg = style({
		...dashed,
		display: 'flex',
		flexDirection: 'column',
		selectors: { '&:not(:last-child)': { borderBottomWidth: 'regular' } },
	})

	export const legHeader = style({
		alignItems: 'center',
		columnGap: '24',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		paddingBlock: '16',
		paddingInline: '16',
		rowGap: '16',
	})

	export const legTokens = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const legIndex = style({
		alignItems: 'center',
		borderColor: 'line.secondary',
		borderRadius: 'full',
		borderStyle: 'solid',
		borderWidth: 'regular',
		color: 'content.secondary',
		display: 'inline-flex',
		flexShrink: 0,
		fontVariantNumeric: 'tabular-nums',
		height: '20',
		justifyContent: 'center',
		typography: 'body.b3',
		width: '20',
	})

	export const legStats = style({
		columnGap: '32',
		display: 'flex',
		flexWrap: 'wrap',
		rowGap: '12',
	})

	export const legStat = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
	})

	export const legStatLabel = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const legStatValue = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums',
		typography: 'body.b2',
	})

	export const note = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const depth = style({ ...dashed, borderTopWidth: 'regular' })

	export const depthNote = style({
		color: 'content.secondary',
		paddingBlock: '16',
		paddingInline: '16',
		typography: 'body.b3',
	})

	export const ladder = style({
		display: 'block',
		fontVariantNumeric: 'tabular-nums',
		paddingBottom: '8',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
		width: '100% !custom',
	})

	export const ladderSection = style({ display: 'block' })

	export const ladderRow = style({
		display: 'grid',
		gap: '16',
		gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
		paddingInline: '16',
	})

	export const ladderHead = style({
		color: 'content.secondary',
		paddingBlock: '8',
	})

	export const ladderLevel = style({
		paddingBlock: '4',
		position: 'relative',
	})

	export const cellStart = style({ fontWeight: 400, textAlign: 'left' })

	export const cellEnd = style({ fontWeight: 400, textAlign: 'right' })

	export const raised = style({ position: 'relative' })

	export const price = variants({
		defaultVariants: { bid: true },
		variants: {
			bid: {
				true: { color: 'content.positive' },
				false: { color: 'content.negative' },
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
				true: { backgroundColor: 'container.positive' },
				false: { backgroundColor: 'container.negative' },
			},
		},
	})

	export const details = style({ display: 'flex', flexDirection: 'column' })

	export const detail = style({
		...dashed,
		alignItems: 'center',
		columnGap: '24',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		paddingBlock: '12',
		paddingInline: '16',
		rowGap: '4',
		selectors: { '&:not(:last-child)': { borderBottomWidth: 'regular' } },
	})

	export const detailToken = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'inline-flex',
		fontWeight: 500,
		gap: '8',
		typography: 'body.b2',
	})

	export const detailAddress = style({
		minWidth: '0 !custom',
		typography: 'body.b3',
	})

	export const badge = style({
		alignItems: 'center',
		backgroundColor: 'background.primary',
		borderColor: 'line.secondary',
		borderRadius: 'full',
		borderStyle: 'solid',
		borderWidth: 'regular',
		color: 'content.primary',
		display: 'inline-flex',
		flexShrink: 0,
		fontWeight: 500,
		gap: '8',
		height: '40',
		paddingLeft: '8',
		paddingRight: '12',
		textDecorationLine: 'none',
		typography: 'body.b2',
		'@media (hover: hover)': { ':hover': { borderColor: 'border.accent' } },
	})

	export const tokenLink = style({
		alignItems: 'center',
		color: 'content.primary',
		display: 'inline-flex',
		fontWeight: 500,
		gap: '8',
		minWidth: '0 !custom',
		textDecorationLine: 'none',
		typography: 'body.b2',
		'@media (hover: hover)': { ':hover': { color: 'content.accent' } },
	})
}
