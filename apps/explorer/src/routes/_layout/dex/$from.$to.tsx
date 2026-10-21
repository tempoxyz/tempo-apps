import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
	useRouterState,
} from '@tanstack/react-router'
import {
	Amount,
	AmountInput,
	Button,
	Callout,
	CopyButton,
	Field,
	Hex,
	Rows,
	Separator,
	Skeleton,
	Surface,
	style,
	Table,
	Tag,
	Token,
	Tooltip,
	variants,
} from '@tempoxyz/ds'
import { ArrowLeft, ArrowRight, SwapVertical } from '@tempoxyz/ds/icons'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import type * as React from 'react'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { DexSwapsGrid, LivePill, useDexSwaps } from '#comps/DexSwaps'
import { Sections } from '#comps/Sections'
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
import { link, linkHover } from '#styles/explorer'
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

const rate = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })
const bps = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const size = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const mainnetSymbols: Record<string, string> = {
	'0x20c00000000000000000000014f22ca97301eb73': 'USDT0',
	'0x20c0000000000000000000000000000000000000': 'pathUSD',
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
	const quoteTitleId = useId()
	const bookTitleId = useId()
	const [section, setSection] = useState(0)
	const [live, setLive] = useState(true)
	const [paused, setPaused] = useState(false)
	// Poll only while the feed is on screen.
	const swaps = useDexSwaps(
		live && !paused && (isMobile || section === 0),
		// Someone who opened this pair wants its swaps, verified or not.
		{
			path: query.data?.path.map((token) => token.address),
			bases: query.data?.legs.map((leg) => leg.base.address),
			unverified: true,
		},
		Boolean(query.data),
	)
	// Copies the full URL, so the link keeps the amount.
	const href = useRouterState({ select: (state) => state.location.href })
	const shareUrl =
		typeof window === 'undefined' ? href : `${window.location.origin}${href}`
	const snapshot = query.data
	const from = snapshot?.path[0]
	const to = snapshot?.path[snapshot.path.length - 1]
	const impact = snapshot
		? quoteImpact(snapshot.quote, snapshot.reference)
		: null
	const mainnet = getTempoChain().id === 4217

	return (
		<div {...styles.page()}>
			<header {...styles.header()}>
				<Button.Link
					render={<Link to="/dex" />}
					size="small"
					variant="secondary"
					{...styles.back()}
				>
					<ArrowLeft />
					Stablecoin DEX
				</Button.Link>
				<div {...styles.titleRow()}>
					<h1 {...styles.title()}>
						{from && to ? (
							<>
								<span {...styles.titleToken()}>
									<Token address={from.address} size="large" />
									{from.symbol}
								</span>
								<span {...styles.titleToken()}>
									<ArrowRight aria-hidden="true" {...styles.titleArrow()} />
									<Token address={to.address} size="large" />
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
					<CopyButton
						aria-label="Copy route link"
						size="medium"
						value={shareUrl}
						variant="secondary"
					/>
				</div>
				{query.isError && !snapshot && (
					<Rows.Root dividers="none" size="small" {...styles.unresolved()}>
						<Rows.Row>
							<Rows.Label>Input token</Rows.Label>
							<Hex.Root value={search.from}>
								<Hex.Text />
								<Hex.Copy aria-label="Copy input token address" />
							</Hex.Root>
						</Rows.Row>
						<Rows.Row>
							<Rows.Label>Output token</Rows.Label>
							<Hex.Root value={search.to}>
								<Hex.Text />
								<Hex.Copy aria-label="Copy output token address" />
							</Hex.Root>
						</Rows.Row>
					</Rows.Root>
				)}
			</header>

			<div {...styles.market()}>
				<Surface render={<section aria-labelledby={quoteTitleId} />}>
					<Surface.Header>
						<Surface.Title id={quoteTitleId}>Quote</Surface.Title>
						{snapshot && (
							<Tooltip.Root>
								<Tooltip.Trigger
									render={
										<Button.Link
											aria-label="Reverse route"
											render={
												<Link
													to="/dex/$from/$to"
													params={{ from: search.to, to: search.from }}
													search={{ amount: search.amount }}
												/>
											}
											shape="icon"
											size="small"
											variant="secondary"
										/>
									}
								>
									<SwapVertical />
								</Tooltip.Trigger>
								<Tooltip.Popup>Reverse route</Tooltip.Popup>
							</Tooltip.Root>
						)}
					</Surface.Header>
					{query.isError && !snapshot ? (
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
					) : query.isPending ? (
						<p role="status" {...styles.pending()}>
							Loading the token path and live quotes…
						</p>
					) : (
						snapshot &&
						from &&
						to && (
							<>
								<div {...styles.amounts()}>
									<AmountField
										key={`${search.from}:${search.to}`}
										amount={search.amount}
										token={from}
										inputError={snapshot.inputError}
									/>
									<div
										{...styles.receive()}
										aria-live="polite"
										aria-busy={query.isFetching}
									>
										<span {...styles.receiveLabel()}>You receive</span>
										{snapshot.quote.amountOut !== null ? (
											<div
												{...styles.amountOut({ fetching: query.isFetching })}
											>
												<Amount
													size="lg"
													symbol={to.symbol}
													value={snapshot.quote.amountOut}
												/>
											</div>
										) : (
											<p {...styles.quoteMessage()}>
												{snapshot.inputError
													? 'Enter a valid amount'
													: quoteMessage(snapshot.quote)}
											</p>
										)}
									</div>
								</div>
								<div {...styles.rows()}>
									<Rows.Root dividers="full">
										{snapshot.path.length > 2 && (
											<Rows.Row>
												<Rows.Label>Route</Rows.Label>
												<ol aria-label="Token path" {...styles.path()}>
													{snapshot.path.map((token, index) => (
														<li key={token.address} {...styles.pathItem()}>
															{index > 0 && (
																<ArrowRight
																	aria-hidden="true"
																	{...styles.arrow()}
																/>
															)}
															<TokenLink token={token} />
														</li>
													))}
												</ol>
											</Rows.Row>
										)}
										{snapshot.quote.amountOut !== null && (
											<>
												<Rows.Row>
													<Rows.Label>Rate</Rows.Label>
													<span {...styles.numeric()}>
														1 {from.symbol} ={' '}
														{rate.format(
															Number(snapshot.quote.amountOut) /
																Number(snapshot.quote.amountIn),
														)}{' '}
														{to.symbol}
													</span>
												</Rows.Row>
												<Rows.Row>
													<Rows.Label
														title={`Compared with the rate for 1 ${from.symbol} at the same block`}
													>
														Price impact
													</Rows.Label>
													<span {...styles.numeric()}>
														{impact === null
															? '—'
															: `${bps.format(impact)} bps`}
													</span>
												</Rows.Row>
											</>
										)}
										<Rows.Row>
											<Rows.Label>Block</Rows.Label>
											<Link
												to="/block/$id"
												params={{ id: snapshot.blockNumber }}
												{...cx(styles.numeric(), link(), linkHover())}
											>
												{BigInt(snapshot.blockNumber).toLocaleString('en-US')}
											</Link>
										</Rows.Row>
									</Rows.Root>
								</div>
								{query.isRefetchError && (
									<Callout intent="warning" {...styles.refreshError()}>
										<Callout.Icon />
										<Callout.Content>
											Refresh failed. Showing the previous block’s snapshot.
										</Callout.Content>
									</Callout>
								)}
								<div {...styles.footer()}>
									<Button
										loading={query.isFetching}
										onClick={() => void query.refetch()}
										size="large"
									>
										Refresh quote
									</Button>
								</div>
							</>
						)
					)}
				</Surface>

				{snapshot && (
					<Surface render={<section aria-labelledby={bookTitleId} />}>
						<Surface.Header>
							<Surface.Title id={bookTitleId}>
								{snapshot.legs.length === 1 ? 'Order book' : 'Order books'}
							</Surface.Title>
						</Surface.Header>
						{snapshot.legs.map((leg, index) => (
							<Fragment key={`${leg.from.address}:${leg.to.address}`}>
								{index > 0 && <Separator {...styles.legSeparator()} />}
								<LegRow
									blockNumber={snapshot.blockNumber}
									index={snapshot.legs.length > 1 ? index : undefined}
									leg={leg}
								/>
							</Fragment>
						))}
					</Surface>
				)}
			</div>

			{snapshot && from && to && (
				<Sections
					mode={isMobile ? 'stacked' : 'tabs'}
					activeSection={section}
					onSectionChange={setSection}
					sections={[
						{
							title: 'Swaps',
							contextual: (
								<LivePill
									live={live && !paused}
									onToggle={() => setLive(!live)}
								/>
							),
							content:
								swaps.isError && !swaps.data ? (
									<div {...styles.alert()}>
										<Callout intent="negative">
											<Callout.Icon />
											<Callout.Content>{swaps.error.message}</Callout.Content>
											<Callout.Action
												disabled={swaps.isFetching}
												onClick={() => void swaps.refetch()}
											>
												{swaps.isFetching ? 'Retrying…' : 'Try again'}
											</Callout.Action>
										</Callout>
									</div>
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
								<Rows.Root dividers="full">
									{snapshot.path.map((token) => (
										<Rows.Row key={token.address}>
											<Rows.Label>
												<span {...styles.detailToken()}>
													<Token address={token.address} size="small" />
													{token.symbol}
												</span>
											</Rows.Label>
											<span {...styles.detailAddress()}>
												<Address address={token.address} align="end" />
												<CopyButton
													aria-label={`Copy ${token.symbol} address`}
													value={token.address}
												/>
											</span>
										</Rows.Row>
									))}
								</Rows.Root>
							),
						},
					]}
				/>
			)}
		</div>
	)
}

/** The amount to quote, written to the URL once it parses for the token. */
function AmountField(props: {
	amount: string
	token: DexToken
	inputError: string | null
}): React.JSX.Element {
	const { amount, token, inputError } = props
	const navigate = Route.useNavigate()
	const isNavigating = useRouterState({
		select: (state) => state.status === 'pending',
	})
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
		<Field.Root invalid={Boolean(error)}>
			<Field.Label>You send</Field.Label>
			<AmountInput.Root
				onValueChange={(value) => {
					setDraft(value)
					setValidationError(null)
				}}
				size="large"
				value={draft}
				variant="card"
			>
				<AmountInput.Control autoComplete="off" name="amount" placeholder="0" />
				<AmountInput.Suffix>{token.symbol}</AmountInput.Suffix>
			</AmountInput.Root>
			<Field.Error match={Boolean(error)}>{error}</Field.Error>
		</Field.Root>
	)
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
					{index !== undefined && <Tag size="small">Leg {index + 1}</Tag>}
					<TokenLink token={leg.from} />
					<ArrowRight aria-hidden="true" {...styles.arrow()} />
					<TokenLink token={leg.to} />
				</div>
				{leg.exists ? (
					<dl {...styles.legStats()}>
						{stats.map((stat) => (
							<div key={stat.label}>
								<dt {...styles.legStatLabel()}>{stat.label}</dt>
								<dd {...styles.legStatValue()}>{stat.value}</dd>
							</div>
						))}
					</dl>
				) : (
					<Tag variant="outlined">Book not created</Tag>
				)}
			</div>
			{leg.bestTick !== null && (
				<div aria-live="polite">
					{depth.isPending ? (
						<Skeleton {...styles.depthSkeleton()}>
							<p role="status">Loading depth…</p>
						</Skeleton>
					) : depth.isError ? (
						<Callout intent="negative">
							<Callout.Icon />
							<Callout.Content>Depth is unavailable.</Callout.Content>
							<Callout.Action onClick={() => void depth.refetch()}>
								Try again
							</Callout.Action>
						</Callout>
					) : depth.data.length === 0 ? (
						<p {...styles.depthNote()}>
							No resting orders within {depthTicks} price levels of the best
							price.
						</p>
					) : (
						<div {...styles.ladder()}>
							<DepthLadder levels={depth.data} leg={leg} />
						</div>
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
	return (
		<Table.Root size="small">
			<Table.Caption>
				Depth within {depthTicks} price levels of the best{' '}
				{leg.isBid ? 'bid' : 'ask'}
			</Table.Caption>
			<Table.Head>
				<Table.Row>
					<Table.HeaderCell>
						Price ({leg.to.symbol} per {leg.from.symbol})
					</Table.HeaderCell>
					<Table.HeaderCell justify="end">
						Size ({leg.from.symbol})
					</Table.HeaderCell>
					<Table.HeaderCell justify="end">
						Total ({leg.from.symbol})
					</Table.HeaderCell>
				</Table.Row>
			</Table.Head>
			<Table.Body>
				{levels.map((level) => (
					// The row positions the bar, so it spans every cell.
					<Table.Row key={level.tick} {...styles.level()}>
						<Table.Cell numeric status={leg.isBid ? 'positive' : 'negative'}>
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
						</Table.Cell>
						<Table.Cell justify="end" numeric>
							<span {...styles.raised()}>
								{size.format(Number(level.amountIn))}
							</span>
						</Table.Cell>
						<Table.Cell justify="end" numeric>
							<span {...styles.raised()}>
								{size.format(Number(level.cumulativeIn))}
							</span>
						</Table.Cell>
					</Table.Row>
				))}
			</Table.Body>
		</Table.Root>
	)
}

function TokenLink(props: { token: DexToken }): React.JSX.Element {
	return (
		<Link
			to="/address/$address"
			params={{ address: props.token.address }}
			{...cx(styles.tokenLink(), link(), linkHover())}
		>
			<Token address={props.token.address} size="small" />
			<span {...styles.breakAll()}>{props.token.symbol}</span>
		</Link>
	)
}

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
		color: 'foreground',
		typography: 'heading.20.subtle',
	})

	export const header = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		minWidth: '0 !custom',
	})

	export const back = style({ alignSelf: 'flex-start' })

	export const titleRow = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
	})

	export const title = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
		margin: '0',
		minWidth: '0 !custom',
		typography: 'heading.24.subtle',
		'@media (width >= 640px)': { typography: 'heading.32.subtle' },
	})

	export const titleToken = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '12',
		whiteSpace: 'nowrap',
	})

	export const titleArrow = style({
		color: 'gray.900',
		height: '24',
		width: '24',
	})

	export const unresolved = style({ maxWidth: '576' })

	// The quote card, at the width of a payment flow, beside the order book.
	// A lone card (while the route loads or fails) takes the whole row.
	export const market = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		'@media (width >= 1024px)': {
			alignItems: 'start',
			display: 'grid',
			gridTemplateColumns: 'minmax(0, 416px) minmax(0, 1fr)',
			selectors: { '& > :only-child': { gridColumn: '1 / -1' } },
		},
	})

	export const breakAll = style({ wordBreak: 'break-all' })

	export const secondary = style({ color: 'gray.900' })

	export const numeric = style({ fontVariantNumeric: 'tabular-nums !custom' })

	export const pending = style({
		color: 'gray.900',
		margin: '0',
		typography: 'copy.14',
	})

	export const amounts = style({ display: 'grid', rowGap: '20' })

	export const receive = style({ display: 'grid', rowGap: '8' })

	// Matches the `Field.Label` above it.
	export const receiveLabel = style({
		color: 'foreground',
		typography: 'label.14.strong',
	})

	export const amountOut = variants({
		base: {
			minWidth: '0 !custom',
			overflowWrap: 'anywhere',
			transitionDuration: '160ms',
			transitionProperty: 'opacity',
		},
		defaultVariants: { fetching: false },
		variants: {
			fetching: { true: { opacity: '0.6 !custom' }, false: {} },
		},
	})

	export const quoteMessage = style({
		color: 'gray.900',
		margin: '0',
		typography: 'heading.20.subtle',
	})

	// Surface pads 24px, so the review rows reach its edges and keep their own
	// inset. They follow the amounts, so a wrapper sets the margins.
	export const rows = style({
		marginBlockStart: '16',
		marginInline: '-24px !custom',
	})

	export const path = style({
		alignItems: 'center',
		columnGap: '8',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'flex-end',
		listStyle: 'none !custom',
		margin: '0',
		padding: '0',
		rowGap: '8',
	})

	export const pathItem = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const arrow = style({
		color: 'gray.900',
		flexShrink: 0,
		height: '16',
		width: '16',
	})

	export const refreshError = style({ marginBlockStart: '16' })

	// A grid cell, so the one large action spans the card.
	export const footer = style({ display: 'grid', marginBlockStart: '24' })

	export const alert = style({ padding: '16' })

	export const legSeparator = style({ marginBlock: '24' })

	export const leg = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
	})

	export const legHeader = style({
		alignItems: 'center',
		columnGap: '24',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		rowGap: '16',
	})

	export const legTokens = style({
		alignItems: 'center',
		display: 'flex',
		gap: '8',
		minWidth: '0 !custom',
	})

	export const legStats = style({
		columnGap: '32',
		display: 'flex',
		flexWrap: 'wrap',
		margin: '0',
		rowGap: '12',
	})

	export const legStatLabel = style({
		color: 'gray.900',
		marginBlockEnd: '4',
		typography: 'label.13',
	})

	export const legStatValue = style({
		color: 'foreground',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'heading.20',
	})

	export const depthSkeleton = style({ height: '192' })

	export const depthNote = style({
		color: 'gray.900',
		margin: '0',
		typography: 'copy.14',
	})

	// Bleeds like a table placed directly in the surface.
	export const ladder = style({ marginInline: '-24px !custom' })

	export const level = style({ position: 'relative' })

	// Text sits above the depth bar.
	export const raised = style({ position: 'relative' })

	export const bar = variants({
		base: {
			bottom: '1',
			left: '0',
			pointerEvents: 'none',
			position: 'absolute',
			top: '1',
		},
		defaultVariants: { bid: true },
		variants: {
			bid: {
				true: { backgroundColor: 'green.100' },
				false: { backgroundColor: 'red.100' },
			},
		},
	})

	export const detailToken = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '8',
	})

	export const detailAddress = style({
		alignItems: 'center',
		display: 'flex',
		gap: '4',
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
	})

	export const tokenLink = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '8',
		minWidth: '0 !custom',
		textDecorationLine: 'none',
		typography: 'copy.14.strong',
	})
}
