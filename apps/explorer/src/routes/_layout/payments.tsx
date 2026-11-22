import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
	Alert,
	BarChart,
	ChoiceGroup,
	Container,
	Empty,
	Grid,
	Skeleton,
	Stack,
	Surface,
	style,
} from '@tempoxyz/ds'
import { useId, useMemo, useState } from 'react'
import type * as React from 'react'
import { PriceFormatter } from '#lib/formatting'
import {
	isoDay,
	type PaymentsDay,
	paymentsTotals,
	weeklyTpv,
} from '#lib/payments'
import { paymentsQueryOptions } from '#lib/queries/payments'

export const Route = createFileRoute('/_layout/payments')({
	component: PaymentsPage,
	head: () => ({ meta: [{ title: 'Payments – Tempo Explorer' }] }),
	loader: async ({ context }) => {
		await Promise.race([
			context.queryClient.prefetchQuery(paymentsQueryOptions()),
			new Promise((resolve) => setTimeout(resolve, LOADER_WAIT)),
		])
	},
})

/** How long navigation waits for data before showing the page without it. */
const LOADER_WAIT = 300

/** Days in the daily charts, labeled every seventh day. */
const CHART_DAYS = 28
const DAY_TICK = 7

/** Weeks in the weekly chart, labeled every third week. */
const CHART_WEEKS = 12
const WEEK_TICK = 3

/**
 * Series colors: the TDS accent, special and warning content colors. BarChart
 * paints SVG fills from strings, which can't hold token references.
 */
const tpvSeries = [
	{
		color: `#4471ed`,
		key: 'tpv',
		label: 'Total payment volume',
	},
] as const

const aopSeries = [
	{
		color: `#4471ed`,
		key: 'stablecoin',
		label: 'Stablecoins',
	},
	{
		color: `#7e59e4`,
		key: 'rwa',
		label: 'Tokenized assets (RWAs)',
	},
	{ color: `#e06f12`, key: 'crypto', label: 'Crypto' },
] as const

const usd = (value: number) => PriceFormatter.format(value, { format: 'short' })

const dayLabel = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
})
const label = (day: string) => dayLabel.format(Date.parse(`${day}T00:00:00Z`))

type Range = 'daily' | 'weekly'

namespace styles {
	export const page = style({
		boxSizing: 'border-box',
		// The layout centres its children, so the page claims the full width.
		width: '100% !custom',
		minWidth: '0',
		paddingBlockStart: '24',
		'@media (min-width: 768px)': { paddingBlockStart: '48' },
		paddingBlockEnd: '64',
		color: 'content.primary',
		typography: 'body.b2',
	})
	export const header = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		minWidth: '0',
	})
	export const title = style({
		color: 'content.primary',
		margin: '0',
		typography: 'heading.h2',
	})
	export const description = style({
		color: 'content.secondary',
		margin: '0',
		typography: 'body.b2',
	})
	export const tiles = style({ margin: '0' })
	export const statLabel = style({
		color: 'content.secondary',
		margin: '0',
		typography: 'body.b2',
	})
	export const statValue = style({
		color: 'content.primary',
		fontVariantNumeric: 'tabular-nums !custom',
		margin: '0',
		typography: 'heading.h2',
	})
	export const note = style({
		color: 'content.tertiary',
		margin: '0',
		typography: 'body.b3',
	})
	/** A phone gives the card more of its width. */
	export const card = style({
		minWidth: '0',
		'@media (max-width: 639px)': { paddingInline: '16' },
	})
	/**
	 * A one-series chart is named by its card's title, so its legend would only
	 * repeat it. BarChart has no option to drop the legend; this hides it.
	 */
	export const single = style({
		minWidth: '0',
		selectors: {
			'& [role="figure"] > :last-child': { display: 'none !custom' },
		},
	})
	export const plot = style({ height: '226px !custom' })
}

function PaymentsPage(): React.JSX.Element {
	const query = useQuery(paymentsQueryOptions())
	const tpvTitleId = useId()
	const aopTitleId = useId()
	const rangeLabelId = useId()
	const [range, setRange] = useState<Range>('daily')
	const days = query.data?.days
	const failed = query.isError && !query.data

	const totals = useMemo(
		() =>
			days && days.length > 0
				? paymentsTotals(days, isoDay(query.data?.asOf ?? Date.now()))
				: undefined,
		[days, query.data?.asOf],
	)
	const charts = useMemo(() => (days ? chartData(days) : undefined), [days])
	const empty = query.isSuccess && (days?.length ?? 0) === 0
	const tpvChart = range === 'daily' ? charts?.daily : charts?.weekly

	return (
		<div {...styles.page()}>
			<Container size="wide">
				<Stack gap="32">
					<header {...styles.header()}>
						<h1 {...styles.title()}>Payments</h1>
						<p {...styles.description()}>
							Total Payments Volume (TPV) and Assets on Platform (AOP) on Tempo,
							in USD.
						</p>
					</header>

					{failed && (
						<Alert intent="negative">
							<Alert.Icon />
							<Alert.Content>
								<Alert.Title>Payment volume unavailable</Alert.Title>
								{query.error?.message ?? 'Unavailable.'}
								<Alert.Action
									disabled={query.isFetching}
									onClick={() => void query.refetch()}
								>
									{query.isFetching ? 'Retrying…' : 'Try again'}
								</Alert.Action>
							</Alert.Content>
						</Alert>
					)}

					{failed ? null : empty ? (
						<Surface size="medium">
							<Empty.Root>
								<Empty.Title>No payment volume on this network</Empty.Title>
							</Empty.Root>
						</Surface>
					) : (
						<>
							<Grid
								fit="small"
								gap="16"
								render={<dl aria-label="Totals" {...styles.tiles()} />}
							>
								<Stat
									label="Daily TPV"
									value={totals?.day}
									title={
										totals?.closed ? `${label(totals.closed)}, UTC` : undefined
									}
								/>
								<Stat
									label="Weekly TPV"
									value={totals?.week}
									title="The last 7 full days, UTC"
								/>
								<Stat label="Lifetime TPV" value={totals?.lifetime} />
								<Stat
									label="AOP"
									value={totals?.aop}
									title={
										totals?.closed
											? `At the close of ${label(totals.closed)}, UTC`
											: undefined
									}
								/>
							</Grid>

							<Surface
								size="medium"
								render={<section aria-labelledby={tpvTitleId} />}
								{...styles.card()}
							>
								<Surface.Header>
									<Surface.Title id={tpvTitleId}>
										Total payment volume
									</Surface.Title>
									<span hidden id={rangeLabelId}>
										Range
									</span>
									<ChoiceGroup.Root
										aria-labelledby={rangeLabelId}
										size="small"
										value={range}
										onValueChange={(value) =>
											setRange(value === 'weekly' ? 'weekly' : 'daily')
										}
									>
										<ChoiceGroup.Item value="daily">Daily</ChoiceGroup.Item>
										<ChoiceGroup.Item value="weekly">Weekly</ChoiceGroup.Item>
									</ChoiceGroup.Root>
								</Surface.Header>
								<div {...styles.single()}>
									{tpvChart ? (
										<BarChart
											aria-labelledby={tpvTitleId}
											data={tpvChart.data}
											format={usd}
											index="label"
											series={tpvSeries}
											ticks={tpvChart.ticks}
										/>
									) : (
										<ChartSkeleton />
									)}
								</div>
							</Surface>

							<Surface
								size="medium"
								render={<section aria-labelledby={aopTitleId} />}
								{...styles.card()}
							>
								<Surface.Header>
									<Surface.Title id={aopTitleId}>
										Assets on platform
									</Surface.Title>
								</Surface.Header>
								{charts ? (
									<BarChart
										aria-labelledby={aopTitleId}
										data={charts.aop.data}
										format={usd}
										index="label"
										series={aopSeries}
										ticks={charts.aop.ticks}
									/>
								) : (
									<ChartSkeleton />
								)}
							</Surface>

							<p {...styles.note()}>
								TPV is the volume of every transfer of the stablecoins on Tempo,
								excluding mints and burns. AOP is the value of the stablecoins,
								tokenized assets and crypto held on Tempo at the end of each
								day. Days are UTC; daily and weekly figures count full days
								only. Non-dollar stablecoins are converted at
								{query.data?.fxDate
									? ` ECB reference rates of ${query.data.fxDate}`
									: ' ECB reference rates'}
								, and tokenized assets and crypto are valued at their latest
								market price.
								{query.data && query.data.unpriced.length > 0
									? ' Some prices are unavailable right now, so those assets are left out.'
									: ''}
							</p>
						</>
					)}
				</Stack>
			</Container>
		</div>
	)
}

type Chart<datum> = { data: datum[]; ticks: string[] }

/** The last full days and weeks; the current partial ones are left out. */
function chartData(days: readonly PaymentsDay[]): {
	daily: Chart<{ label: string; tpv: number }>
	weekly: Chart<{ label: string; tpv: number }>
	aop: Chart<{ label: string; stablecoin: number; rwa: number; crypto: number }>
} {
	const recent = days.slice(0, -1).slice(-CHART_DAYS)
	const dayTicks = everyNth(
		recent.map((entry) => label(entry.day)),
		DAY_TICK,
	)
	const weeks = weeklyTpv(days).slice(0, -1).slice(-CHART_WEEKS)
	return {
		daily: {
			data: recent.map((entry) => ({
				label: label(entry.day),
				tpv: entry.tpv,
			})),
			ticks: dayTicks,
		},
		weekly: {
			data: weeks.map((entry) => ({
				label: label(entry.week),
				tpv: entry.tpv,
			})),
			ticks: everyNth(
				weeks.map((entry) => label(entry.week)),
				WEEK_TICK,
			),
		},
		aop: {
			data: recent.map((entry) => ({
				label: label(entry.day),
				stablecoin: entry.stablecoin,
				rwa: entry.rwa,
				crypto: entry.crypto,
			})),
			ticks: dayTicks,
		},
	}
}

/** Every nth label, counted back from the last so the latest bar is labeled. */
function everyNth(labels: readonly string[], n: number): string[] {
	return labels.filter((_, index) => (labels.length - 1 - index) % n === 0)
}

function ChartSkeleton(): React.JSX.Element {
	return <Skeleton {...styles.plot()} />
}

function Stat(props: StatProps): React.JSX.Element {
	return (
		<Surface size="medium" {...styles.card()}>
			<Stack gap="8">
				<dt {...styles.statLabel()} title={props.title}>
					{props.label}
				</dt>
				<dd {...styles.statValue()}>
					<Skeleton show={props.value === undefined}>
						{props.value === undefined ? '$0.00M' : usd(props.value)}
					</Skeleton>
				</dd>
			</Stack>
		</Surface>
	)
}

type StatProps = {
	label: string
	value: number | undefined
	title?: string | undefined
}
