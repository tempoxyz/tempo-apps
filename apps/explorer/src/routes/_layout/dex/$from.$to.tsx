import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	stripSearchParams,
	useRouterState,
} from '@tanstack/react-router'
import {
	Alert,
	Amount,
	AmountInput,
	Badge,
	Button,
	CopyButton,
	Field,
	Hex,
	ListGroup,
	Separator,
	Skeleton,
	style,
	Surface,
	Table,
	Token,
	TokenLogo,
	Tooltip,
	variants,
} from '@tempoxyz/ds'
import { ArrowLeft, ArrowRight, SwapVertical } from '@tempoxyz/ds/icons'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import type * as React from 'react'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { DexSwapsGrid, LivePill, useDexSwaps } from '#comps/DexSwaps'
import { PropAmmPairPools } from '#comps/PropAmmPairPools'
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
import { propAmmQuotesQueryOptions } from '#lib/queries/propamm'
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

const rate = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
const bps = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const size = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const mainnetSymbols: Record<string, string> = {
	'0x20c00000000000000000000014f22ca97301eb73': 'USDT0',
	'0x20c0000000000000000000000000000000000000': 'pathUSD',
}

type Venue = {
	key: string
	label: string
	/** The DEX's route when it trades through other books. */
	detail?: string | undefined
	amountOut: string | null
	message: string
}

function quoteMessage(quote: DexQuote, legs: readonly DexLeg[]): string {
	const missing = legs.find((leg) => !leg.exists)
	if (missing)
		return `No ${missing.from.symbol} → ${missing.to.symbol} order book`
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
	// A route with a missing book can't trade, so its books and swaps aren't
	// shown; the quote says which book is missing.
	const dexRoutable = query.data?.legs.every((leg) => leg.exists) ?? false
	const [live, setLive] = useState(true)
	const [paused, setPaused] = useState(false)
	// Poll only while the feed is on screen.
	const swaps = useDexSwaps(
		dexRoutable && live && !paused && (isMobile || section === 0),
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
	const propAmmQuotes = useQuery({
		...propAmmQuotesQueryOptions(search),
		enabled: Boolean(snapshot) && !snapshot?.inputError,
	})
	const quoteFetching = query.isFetching || propAmmQuotes.isFetching
	// Every venue quoting the same swap; the page leads with the best.
	const propAmmVenues = propAmmQuotes.data ?? []
	// The DEX only counts as a venue when it can route the pair, or when it is
	// the only one, so its message explains the empty quote.
	const showDex = dexRoutable || propAmmVenues.length === 0
	const venues: Venue[] = snapshot
		? [
				...(showDex
					? [
							{
								key: 'dex',
								label: 'Stablecoin DEX',
								detail:
									dexRoutable && snapshot.path.length > 2
										? 'via ' +
											snapshot.path
												.slice(1, -1)
												.map((token) => token.symbol)
												.join(' → ')
										: undefined,
								amountOut: snapshot.quote.amountOut,
								message: quoteMessage(snapshot.quote, snapshot.legs),
							},
						]
					: []),
				...propAmmVenues.map((quote) => ({
					key: quote.key,
					label: `PropAMM ${quote.version}`,
					amountOut: quote.amountOut,
					message:
						quote.status === 'no-liquidity'
							? 'Not enough inventory'
							: 'Quote unavailable',
				})),
			]
		: []
	const best = venues.reduce<(Venue & { amountOut: string }) | undefined>(
		(top, venue) =>
			venue.amountOut !== null &&
			(!top || Number(venue.amountOut) > Number(top.amountOut))
				? { ...venue, amountOut: venue.amountOut }
				: top,
		undefined,
	)
	// "Best" only means something beside another quote.
	const quoted = venues.filter((venue) => venue.amountOut !== null).length
	// A lone venue's row names a venue other than the DEX or the DEX's route;
	// a lone failure is already the headline.
	const showVenues =
		venues.length > 1 ||
		(Boolean(best) && (!showDex || Boolean(venues[0]?.detail)))

	return (
		<div {...styles.page()}>
			<header {...styles.header()}>
				<Button.Link
					render={<Link to="/markets" />}
					size="small"
					variant="secondary"
					{...styles.back()}
				>
					<ArrowLeft />
					Markets
				</Button.Link>
				<div {...styles.titleRow()}>
					<h1 {...styles.title()}>
						{' '}
						{from && to ? (
							<>
								<span {...styles.titleToken()}>
									<TokenLogo address={from.address} size="large" />
									{from.symbol}
								</span>
								<span {...styles.titleToken()}>
									<ArrowRight aria-hidden="true" {...styles.titleArrow()} />
									<TokenLogo address={to.address} size="large" />
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
					<ListGroup.Root dividers={false} {...styles.unresolved()}>
						<ListGroup.Row>
							<ListGroup.Label>Input token</ListGroup.Label>
							<Hex.Root value={search.from}>
								<Hex.Text />
								<Hex.Copy aria-label="Copy input token address" />
							</Hex.Root>
						</ListGroup.Row>
						<ListGroup.Row>
							<ListGroup.Label>Output token</ListGroup.Label>
							<Hex.Root value={search.to}>
								<Hex.Text />
								<Hex.Copy aria-label="Copy output token address" />
							</Hex.Root>
						</ListGroup.Row>
					</ListGroup.Root>
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
						<Alert intent="negative">
							<Alert.Icon />
							<Alert.Content>{query.error.message}</Alert.Content>
							<Alert.Action
								disabled={query.isFetching}
								onClick={() => void query.refetch()}
							>
								{query.isFetching ? 'Retrying…' : 'Try again'}
							</Alert.Action>
						</Alert>
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
										aria-busy={quoteFetching}
									>
										<span {...styles.receiveLabel()}>You receive</span>
										{best ? (
											<div {...styles.amountOut({ fetching: quoteFetching })}>
												<Amount
													size="lg"
													symbol={to.symbol}
													value={best.amountOut}
												/>
											</div>
										) : (
											<p {...styles.quoteMessage()}>
												{snapshot.inputError
													? 'Enter a valid amount'
													: venues.length > 1
														? 'No venue can fill this amount'
														: (venues[0]?.message ??
															quoteMessage(snapshot.quote, snapshot.legs))}
											</p>
										)}
									</div>
								</div>
								<ListGroup.Root {...styles.rows()}>
									{best && (
										<ListGroup.Row>
											<ListGroup.Label>Rate</ListGroup.Label>
											<span {...styles.numeric()}>
												1 {from.symbol} ={' '}
												{rate.format(
													Number(best.amountOut) /
														Number(snapshot.quote.amountIn),
												)}{' '}
												{to.symbol}
											</span>
										</ListGroup.Row>
									)}
									{best?.key === 'dex' && (
										<ListGroup.Row>
											<ListGroup.Label
												title={`Compared with the rate for 1 ${from.symbol} at the same block`}
											>
												Price impact
											</ListGroup.Label>
											<span {...styles.numeric()}>
												{impact === null ? '—' : `${bps.format(impact)} bps`}
											</span>
										</ListGroup.Row>
									)}
									{showVenues &&
										venues.map((venue) => (
											<ListGroup.Row key={venue.key}>
												<ListGroup.Info>
													<ListGroup.Title>{venue.label}</ListGroup.Title>
													{venue.detail && (
														<ListGroup.Description>
															{venue.detail}
														</ListGroup.Description>
													)}
												</ListGroup.Info>
												<span
													{...styles.venueValue({
														best: venue.key === best?.key,
													})}
												>
													{venue.amountOut === null ? (
														venue.message
													) : (
														<Amount
															symbol={to.symbol}
															value={venue.amountOut}
														/>
													)}
													{venue.key === best?.key && quoted > 1 && (
														<span {...styles.best()}> · Best</span>
													)}
												</span>
											</ListGroup.Row>
										))}
									<ListGroup.Row>
										<ListGroup.Label>Block</ListGroup.Label>
										<Link
											to="/block/$id"
											params={{ id: snapshot.blockNumber }}
											{...cx(styles.numeric(), link(), linkHover())}
										>
											{BigInt(snapshot.blockNumber).toLocaleString('en-US')}
										</Link>
									</ListGroup.Row>
								</ListGroup.Root>
								{query.isRefetchError && (
									<Alert intent="warning" {...styles.refreshError()}>
										<Alert.Icon />
										<Alert.Content>
											Refresh failed. Showing the previous block’s snapshot.
										</Alert.Content>
									</Alert>
								)}
								<div {...styles.footer()}>
									<Button
										loading={quoteFetching}
										onClick={() => {
											void query.refetch()
											if (propAmmQuotes.isEnabled) void propAmmQuotes.refetch()
										}}
										size="large"
									>
										Refresh quote
									</Button>
								</div>
							</>
						)
					)}
				</Surface>

				{snapshot && from && to && dexRoutable && (
					<Surface render={<section aria-labelledby={bookTitleId} />}>
						<Surface.Header>
							<Surface.Title id={bookTitleId}>
								{snapshot.legs.length === 1 ? 'Order book' : 'Route'}
							</Surface.Title>
						</Surface.Header>
						{snapshot.legs.length > 1 && (
							<Surface.Description>
								The Stablecoin DEX has no {from.symbol} / {to.symbol} book, so a
								swap trades through these {snapshot.legs.length} books in turn.
							</Surface.Description>
						)}
						{snapshot.legs.map((leg, index) => (
							<Fragment key={`${leg.from.address}:${leg.to.address}`}>
								{index > 0 && <Separator {...styles.legSeparator()} />}
								<LegRow
									blockNumber={snapshot.blockNumber}
									index={snapshot.legs.length > 1 ? index : undefined}
									leg={leg}
									showDepth={snapshot.legs.length === 1}
								/>
							</Fragment>
						))}
					</Surface>
				)}
			</div>

			<PropAmmPairPools a={search.from} b={search.to} />

			{snapshot && from && to && dexRoutable && (
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
										<Alert intent="negative">
											<Alert.Icon />
											<Alert.Content>{swaps.error.message}</Alert.Content>
											<Alert.Action
												disabled={swaps.isFetching}
												onClick={() => void swaps.refetch()}
											>
												{swaps.isFetching ? 'Retrying…' : 'Try again'}
											</Alert.Action>
										</Alert>
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
								<ListGroup.Root>
									{snapshot.path.map((token) => (
										<ListGroup.Row key={token.address}>
											<ListGroup.Label>
												<span {...styles.detailToken()}>
													<TokenLogo address={token.address} size="small" />
													{token.symbol}
												</span>
											</ListGroup.Label>
											<span {...styles.detailAddress()}>
												<Address address={token.address} align="end" />
												<CopyButton
													aria-label={`Copy ${token.symbol} address`}
													value={token.address}
												/>
											</span>
										</ListGroup.Row>
									))}
								</ListGroup.Root>
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
			<AmountInput.Root
				onValueChange={(value) => {
					setDraft(value)
					setValidationError(null)
				}}
				value={draft}
			>
				<Field.Label>You send</Field.Label>
				<AmountInput.Control autoComplete="off" name="amount" placeholder="0" />
				<Token address={token.address} symbol={token.symbol} />
			</AmountInput.Root>
			<Field.Error match={Boolean(error)}>{error}</Field.Error>
		</Field.Root>
	)
}

function LegRow(props: {
	blockNumber: string
	index: number | undefined
	leg: DexLeg
	/** A direct pair shows its depth; a route's hops show only their best prices. */
	showDepth: boolean
}): React.JSX.Element {
	const { blockNumber, index, leg, showDepth } = props
	const depth = useQuery({
		...dexLegDepthQueryOptions({
			from: leg.from.address,
			to: leg.to.address,
			tick: leg.bestTick ?? 0,
			blockNumber,
		}),
		enabled: showDepth && leg.bestTick !== null,
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
					{index !== undefined && <Badge size="small">Leg {index + 1}</Badge>}
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
					<Badge size="small" variant="outlined">
						Book not created
					</Badge>
				)}
			</div>
			{showDepth && leg.bestTick !== null && (
				<div aria-live="polite">
					{' '}
					{depth.isPending ? (
						<Skeleton {...styles.depthSkeleton()}>
							<p role="status">Loading depth…</p>
						</Skeleton>
					) : depth.isError ? (
						<Alert intent="negative">
							<Alert.Icon />
							<Alert.Content>Depth is unavailable.</Alert.Content>
							<Alert.Action onClick={() => void depth.refetch()}>
								Try again
							</Alert.Action>
						</Alert>
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
			<TokenLogo address={props.token.address} size="small" />
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
		color: 'content.primary',
		typography: 'heading.h3',
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
		color: 'content.primary',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
		margin: '0',
		minWidth: '0 !custom',
		typography: 'heading.h2',
		'@media (width >= 640px)': { typography: 'value.v3' },
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

	export const secondary = style({ color: 'content.secondary' })

	export const numeric = style({ fontVariantNumeric: 'tabular-nums !custom' })

	export const pending = style({
		color: 'content.secondary',
		margin: '0',
		typography: 'body.b2',
	})

	export const amounts = style({ display: 'grid', rowGap: '20' })

	export const receive = style({ display: 'grid', rowGap: '8' })

	// Matches the `Field.Label` above it.
	export const receiveLabel = style({
		color: 'content.primary',
		typography: 'body.b2Strong',
	})

	export const amountOut = variants({
		base: {
			minWidth: '0 !custom',
			overflowWrap: 'anywhere',
			transitionDuration: '160',
			transitionProperty: 'opacity',
		},
		defaultVariants: { fetching: false },
		variants: {
			fetching: { true: { opacity: '0.6 !custom' }, false: {} },
		},
	})

	export const quoteMessage = style({
		color: 'content.secondary',
		margin: '0',
		typography: 'heading.h3',
	})

	// The card's list bleeds to its edges itself; this only spaces it from the
	// amounts.
	export const rows = style({ marginBlockStart: '16' })

	// A venue's quote, in the primary color when it is the best.
	export const venueValue = variants({
		base: { color: 'content.secondary', fontVariantNumeric: 'tabular-nums' },
		defaultVariants: { best: false },
		variants: { best: { false: {}, true: { color: 'content.primary' } } },
	})

	export const best = style({ color: 'content.positive' })

	export const arrow = style({
		color: 'content.secondary',
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
		color: 'content.secondary',
		marginBlockEnd: '4',
		typography: 'body.b3',
	})

	export const legStatValue = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'heading.h3',
	})

	export const depthSkeleton = style({ height: '200' })

	export const depthNote = style({
		color: 'content.secondary',
		margin: '0',
		typography: 'body.b2',
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
				true: { backgroundColor: 'container.positive' },
				false: { backgroundColor: 'container.negative' },
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
		typography: 'body.b2Strong',
	})
}
