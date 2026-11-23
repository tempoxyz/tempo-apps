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
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import {
	isoDay,
	type PaymentsDay,
	type PaymentsPeriod,
	type Period,
	paymentsTotals,
	periods,
} from '#lib/payments'
import { OG_BASE_URL } from '#lib/og'
import { paymentsQueryOptions } from '#lib/queries/payments'

export const Route = createFileRoute('/_layout/payments')({
	component: PaymentsPage,
	head: () => ({
		meta: [
			{ title: 'Payments – Tempo Explorer' },
			{ property: 'og:title', content: 'Payments – Tempo Explorer' },
			{
				property: 'og:description',
				content:
					'Total Payments Volume and Assets on Platform on Tempo, in USD.',
			},
			{ property: 'og:image', content: `${OG_BASE_URL}/payments` },
			{ property: 'og:image:type', content: 'image/webp' },
			{ property: 'og:image:width', content: '1200' },
			{ property: 'og:image:height', content: '630' },
			{ name: 'twitter:card', content: 'summary_large_image' },
			{ name: 'twitter:image', content: `${OG_BASE_URL}/payments` },
		],
	}),
	loader: async ({ context }) => {
		await Promise.race([
			context.queryClient.prefetchQuery(paymentsQueryOptions()),
			new Promise((resolve) => setTimeout(resolve, LOADER_WAIT)),
		])
	},
})

const LOADER_WAIT = 300

const RANGES = {
	day: { bars: 28, tick: 7 },
	week: { bars: 12, tick: 3 },
	month: { bars: 12, tick: 3 },
} as const satisfies Record<Period, { bars: number; tick: number }>

const LIFETIME_TICK = 3

const CHART_START = '2026-03-01'

const tpvSeries = [
	{
		color: `#4471ed`,
		key: 'tpv',
		label: 'Total Payments Volume',
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
		label: 'Tokenized assets',
	},
	{ color: `#e06f12`, key: 'crypto', label: 'Crypto' },
] as const

const usdFormat = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	notation: 'compact',
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
})
const usd = (value: number) => (value === 0 ? '$0' : usdFormat.format(value))

const dayLabel = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
})
const label = (day: string) => dayLabel.format(Date.parse(`${day}T00:00:00Z`))

const monthLabel = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC',
})
const periodLabel = (start: string, period: Period) =>
	period === 'month'
		? monthLabel.format(Date.parse(`${start}T00:00:00Z`))
		: label(start)

const rangeLabels = { day: 'Daily', week: 'Weekly', month: 'Monthly' } as const

namespace styles {
	export const page = style({
		boxSizing: 'border-box',
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
	export const card = style({
		minWidth: '0',
		'@media (max-width: 639px)': { paddingInline: '16' },
	})
	export const single = style({
		minWidth: '0',
		selectors: {
			'& [role="figure"] > :last-child': { display: 'none !custom' },
		},
	})
	export const chart = style({
		minWidth: '0',
		selectors: {
			'& svg.recharts-surface': { overflow: 'visible !custom' },
			'& .recharts-yAxis-tick-labels > .recharts-cartesian-axis-tick-label:last-child text':
				{
					transform: 'translateY(-11px) !custom',
				},
		},
	})
	export const settled = style({
		minWidth: '0',
		clipPath: 'inset(-24px -16px -16px -16px) !custom',
	})
	export const cardHeader = style({
		flexWrap: 'wrap',
		minHeight: '32',
		rowGap: '12',
	})
	export const chartRow = style({
		display: 'grid',
		gap: '16',
		gridTemplateColumns:
			'repeat(auto-fit, minmax(min(28rem, 100%), 1fr)) !custom',
	})
	export const cardTitle = style({ whiteSpace: 'nowrap' })
	export const plot = style({ height: '226px !custom' })
}

function PaymentsPage(): React.JSX.Element {
	const query = useQuery(paymentsQueryOptions())
	const [tpvRange, setTpvRange] = useState<Period>('day')
	const [aopRange, setAopRange] = useState<Period>('day')
	const days = query.data?.days
	const failed = query.isError && !query.data

	const totals = useMemo(
		() =>
			days && days.length > 0
				? paymentsTotals(days, isoDay(query.data?.asOf ?? Date.now()))
				: undefined,
		[days, query.data?.asOf],
	)
	const closed = useMemo(() => days?.slice(0, -1), [days])
	const lifetime = useMemo(
		() => (closed ? lifetimeCharts(closed) : undefined),
		[closed],
	)
	const tpvChart = useMemo(
		() => (closed ? rangeChart(closed, tpvRange) : undefined),
		[closed, tpvRange],
	)
	const aopChart = useMemo(
		() => (closed ? rangeChart(closed, aopRange) : undefined),
		[closed, aopRange],
	)
	const empty = query.isSuccess && (days?.length ?? 0) === 0
	const behind = Boolean(
		query.data?.through &&
			query.data.through < isoDay(query.data.asOf - 86_400_000),
	)

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

					{behind && query.data?.through && (
						<Alert intent="warning">
							<Alert.Icon />
							<Alert.Content>
								<Alert.Title>
									Showing data through {label(query.data.through)}
								</Alert.Title>
								Newer data is temporarily unavailable. The page updates on its
								own when it returns.
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
									label="Lifetime Total Payments Volume"
									value={totals?.lifetime}
								/>
								<Stat
									label="Assets on Platform"
									value={totals?.aop}
									title={
										totals?.closed
											? `At the close of ${label(totals.closed)}, UTC`
											: undefined
									}
								/>
							</Grid>

							<div {...styles.chartRow()}>
								<ChartCard
									title="Lifetime Total Payments Volume"
									single
									chart={lifetime?.tpv}
									series={tpvSeries}
								/>
								<ChartCard
									title="Total Payments Volume"
									single
									chart={tpvChart}
									series={tpvSeries}
									range={tpvRange}
									onRangeChange={setTpvRange}
								/>
							</div>

							<div {...styles.chartRow()}>
								<ChartCard
									title="Lifetime Assets on Platform"
									chart={lifetime?.aop}
									series={aopSeries}
								/>
								<ChartCard
									title="Assets on Platform"
									chart={aopChart}
									series={aopSeries}
									range={aopRange}
									onRangeChange={setAopRange}
								/>
							</div>

							<p {...styles.note()}>
								Total Payments Volume is the volume of every transfer of the
								stablecoins on Tempo, excluding mints and burns. Assets on
								Platform is the value of the stablecoins, tokenized assets and
								crypto held on Tempo at the end of each day. Lifetime Total
								Payments Volume adds up each month since launch, and each
								period's Assets on Platform is the value at the period's close.
								Days are UTC and charts count full days only, so the latest week
								and month run to yesterday. Assets are valued at their latest
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

type ChartDatum = {
	label: string
	tpv: number
	stablecoin: number
	rwa: number
	crypto: number
}

type Chart = { data: ChartDatum[]; ticks: string[] }

function lifetimeCharts(days: readonly PaymentsDay[]): {
	tpv: Chart
	aop: Chart
} {
	let total = 0
	const data = periods(days, 'month')
		.map((entry) => {
			total += entry.tpv
			return { ...datum(entry, 'month'), tpv: total, start: entry.start }
		})
		.filter((entry) => entry.start >= CHART_START)
		.map(({ start: _, ...entry }) => entry)
	const chart = { data, ticks: everyNth(data, LIFETIME_TICK) }
	return { tpv: chart, aop: chart }
}

function rangeChart(days: readonly PaymentsDay[], period: Period): Chart {
	const { bars, tick } = RANGES[period]
	const data = periods(days, period)
		.filter((entry) => entry.start >= CHART_START)
		.slice(-bars)
		.map((entry) => datum(entry, period))
	return { data, ticks: everyNth(data, tick) }
}

function datum(entry: PaymentsPeriod, period: Period): ChartDatum {
	return {
		label: periodLabel(entry.start, period),
		tpv: entry.tpv,
		stablecoin: entry.stablecoin,
		rwa: entry.rwa,
		crypto: entry.crypto,
	}
}

function everyNth(data: readonly ChartDatum[], n: number): string[] {
	return data
		.filter((_, index) => (data.length - 1 - index) % n === 0)
		.map((entry) => entry.label)
}

function ChartCard(props: ChartCardProps): React.JSX.Element {
	const titleId = useId()
	const rangeId = useId()
	const { chart, range, onRangeChange } = props
	const plot = chart ? (
		<BarChart
			aria-labelledby={titleId}
			data={chart.data}
			format={usd}
			index="label"
			series={props.series}
			ticks={chart.ticks}
		/>
	) : (
		<ChartSkeleton />
	)
	return (
		<Surface
			size="medium"
			render={<section aria-labelledby={titleId} />}
			{...styles.card()}
		>
			<Surface.Header {...styles.cardHeader()}>
				<Surface.Title id={titleId} {...styles.cardTitle()}>
					{props.title}
				</Surface.Title>
				{range && onRangeChange && (
					<>
						<span hidden id={rangeId}>
							{props.title} range
						</span>
						<ChoiceGroup.Root
							aria-labelledby={rangeId}
							size="small"
							value={range}
							onValueChange={(value) => onRangeChange(value as Period)}
						>
							{(Object.keys(rangeLabels) as Period[]).map((period) => (
								<ChoiceGroup.Item key={period} value={period}>
									{rangeLabels[period]}
								</ChoiceGroup.Item>
							))}
						</ChoiceGroup.Root>
					</>
				)}
			</Surface.Header>
			<SettledWidth>
				<div {...styles.chart()}>
					{props.single ? <div {...styles.single()}>{plot}</div> : plot}
				</div>
			</SettledWidth>
		</Surface>
	)
}

type ChartCardProps = {
	title: string
	chart: Chart | undefined
	series:
		| BarChart.Series<'tpv' | 'stablecoin' | 'rwa' | 'crypto'>[]
		| readonly BarChart.Series<'tpv' | 'stablecoin' | 'rwa' | 'crypto'>[]
	single?: boolean | undefined
	range?: Period | undefined
	onRangeChange?: ((range: Period) => void) | undefined
}

const RESIZE_SETTLE = 150

function SettledWidth(props: { children: React.ReactNode }): React.JSX.Element {
	const ref = useRef<HTMLDivElement>(null)
	const [width, setWidth] = useState<number>()
	useEffect(() => {
		const element = ref.current
		if (!element) return
		let timer: ReturnType<typeof setTimeout> | undefined
		const observer = new ResizeObserver(([entry]) => {
			const next = Math.floor(entry?.contentRect.width ?? 0)
			clearTimeout(timer)
			timer = setTimeout(() => setWidth(next), RESIZE_SETTLE)
		})
		observer.observe(element)
		return () => {
			clearTimeout(timer)
			observer.disconnect()
		}
	}, [])
	return (
		<div ref={ref} {...styles.settled()}>
			<div style={width ? { width } : undefined}>{props.children}</div>
		</div>
	)
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
