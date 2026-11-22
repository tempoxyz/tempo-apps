import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
	Alert,
	BarChart,
	Container,
	Empty,
	Grid,
	Skeleton,
	Stack,
	Surface,
	style,
	Tabs,
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

/** Days in the daily charts. */
const CHART_DAYS = 30

/** Weeks in the weekly chart. */
const CHART_WEEKS = 12

const CHART_COLOR = 'var(--color-accent)'

const usd = (value: number) => PriceFormatter.format(value, { format: 'short' })

const dayLabel = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
})
const label = (day: string) => dayLabel.format(Date.parse(`${day}T00:00:00Z`))

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
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '16',
		justifyContent: 'space-between',
		minWidth: '0',
	})
	export const title = style({
		color: 'content.primary',
		margin: '0',
		typography: 'heading.h2',
	})
	export const chartTitle = style({
		color: 'content.primary',
		margin: '0',
		typography: 'body.b2Strong',
	})
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
	export const chartHeader = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
		justifyContent: 'space-between',
		minWidth: '0',
	})
	/** A phone gives the card more of its width. */
	export const card = style({
		minWidth: '0',
		'@media (max-width: 639px)': { paddingInline: '16' },
	})
}

function PaymentsPage(): React.JSX.Element {
	const query = useQuery(paymentsQueryOptions())
	const tpvChartId = useId()
	const aopChartId = useId()
	const [period, setPeriod] = useState<'daily' | 'weekly'>('daily')
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

	return (
		<div {...styles.page()}>
			<Container size="wide">
				<Stack gap="32">
					<div {...styles.header()}>
						<h1 {...styles.title()}>Payments</h1>
					</div>

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

					{empty ? (
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
								render={<section aria-label="Totals" />}
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

							<Surface size="medium" {...styles.card()}>
								<Stack gap="16">
									<div {...styles.chartHeader()}>
										<h2 {...styles.chartTitle()} id={tpvChartId}>
											Total payment volume
										</h2>
										<Tabs.Root
											value={period}
											onValueChange={(value) =>
												setPeriod(value === 'weekly' ? 'weekly' : 'daily')
											}
										>
											<Tabs.List
												variant="pill"
												size="small"
												aria-label="Period"
											>
												<Tabs.Tab value="daily">Daily</Tabs.Tab>
												<Tabs.Tab value="weekly">Weekly</Tabs.Tab>
											</Tabs.List>
										</Tabs.Root>
									</div>
									<Chart
										labelledBy={tpvChartId}
										data={period === 'daily' ? charts?.daily : charts?.weekly}
										seriesKey="tpv"
										seriesLabel="TPV"
									/>
								</Stack>
							</Surface>

							<Surface size="medium" {...styles.card()}>
								<Stack gap="16">
									<h2 {...styles.chartTitle()} id={aopChartId}>
										Assets on platform
									</h2>
									<Chart
										labelledBy={aopChartId}
										data={charts?.aop}
										seriesKey="aop"
										seriesLabel="AOP"
									/>
								</Stack>
							</Surface>

							<p {...styles.note()}>
								TPV is the volume of every transfer of the stablecoins on Tempo,
								excluding mints and burns. AOP is the stablecoin supply held on
								Tempo at the end of each day. Days are UTC; daily and weekly
								figures count full days only. Non-dollar stablecoins are
								converted at
								{query.data?.fxDate
									? ` ECB reference rates of ${query.data.fxDate}.`
									: ' ECB reference rates.'}
								{query.data && query.data.unpriced.length > 0
									? ` Rates for ${query.data.unpriced.join(', ')} are unavailable, so they are left out.`
									: ''}
							</p>
						</>
					)}
				</Stack>
			</Container>
		</div>
	)
}

type ChartDatum = { label: string; tpv: number; aop: number }

/** The last days and weeks, the current partial ones left out. */
function chartData(days: readonly PaymentsDay[]): {
	daily: ChartDatum[]
	weekly: ChartDatum[]
	aop: ChartDatum[]
} {
	const closed = days.slice(0, -1)
	const recent = closed.slice(-CHART_DAYS)
	const daily = recent.map((entry) => ({
		label: label(entry.day),
		tpv: entry.tpv,
		aop: entry.aop,
	}))
	const weekly = weeklyTpv(days)
		.slice(0, -1)
		.slice(-CHART_WEEKS)
		.map((entry) => ({
			label: `Wk of ${label(entry.week)}`,
			tpv: entry.tpv,
			aop: 0,
		}))
	return { daily, weekly, aop: daily }
}

function Chart(props: ChartProps): React.JSX.Element {
	if (!props.data)
		return (
			<Skeleton>
				<div style={{ height: 226 }} />
			</Skeleton>
		)
	return (
		<BarChart
			aria-labelledby={props.labelledBy}
			data={props.data}
			format={usd}
			index="label"
			series={[
				{ color: CHART_COLOR, key: props.seriesKey, label: props.seriesLabel },
			]}
		/>
	)
}

type ChartProps = {
	labelledBy: string
	data: ChartDatum[] | undefined
	seriesKey: 'tpv' | 'aop'
	seriesLabel: string
}

function Stat(props: StatProps): React.JSX.Element {
	return (
		<Surface size="medium" {...styles.card()}>
			<Stack gap="8">
				<p {...styles.statLabel()} title={props.title}>
					{props.label}
				</p>
				<Skeleton show={props.value === undefined}>
					<p {...styles.statValue()}>
						{props.value === undefined ? '$0.00M' : usd(props.value)}
					</p>
				</Skeleton>
			</Stack>
		</Surface>
	)
}

type StatProps = {
	label: string
	value: number | undefined
	title?: string | undefined
}
