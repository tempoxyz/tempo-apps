import * as React from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
	fetchTrendRuns,
	type BenchRun,
	type ScenarioRunHistory,
} from '#lib/server/bench'
import { formatDate, formatGas, formatTps } from '#lib/format'

type Period = '7d' | '30d' | '90d'

const PERIODS: Array<{ value: Period; label: string; days: number }> = [
	{ value: '7d', label: '7D', days: 7 },
	{ value: '30d', label: '30D', days: 30 },
	{ value: '90d', label: '90D', days: 90 },
]

const COLORS = {
	tps: '#60a5fa',
	gas: '#30a46c',
	mean: '#a78bfa',
	p50: '#30a46c',
	p90: '#e2a336',
	p99: '#e5484d',
}

export const Route = createFileRoute('/trends')({
	validateSearch: (search: Record<string, unknown>): { period: Period } => ({
		period:
			search.period === '7d' || search.period === '90d' ? search.period : '30d',
	}),
	loaderDeps: ({ search }) => ({ period: search.period }),
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData({
			queryKey: ['trendRuns', 'nightly'],
			queryFn: () => fetchTrendRuns({ data: 'nightly' }),
		})
	},
	component: TrendsPage,
})

function TrendsPage(): React.JSX.Element {
	const { period } = Route.useSearch()
	const { data: histories } = useSuspenseQuery({
		queryKey: ['trendRuns', 'nightly'],
		queryFn: () => fetchTrendRuns({ data: 'nightly' }),
	})

	const selectedPeriod = PERIODS.find((p) => p.value === period) ?? PERIODS[1]
	const allRuns = histories.flatMap((history) => history.runs)
	const maxTimestamp = allRuns.length
		? Math.max(...allRuns.map((run) => new Date(run.startedAt).getTime()))
		: null
	const xDomain = maxTimestamp
		? ([
				maxTimestamp - selectedPeriod.days * 24 * 60 * 60 * 1000,
				maxTimestamp,
			] as const)
		: null
	const historiesWithData = histories.filter(
		(history) => history.runs.length > 0,
	)
	const hasRuns = historiesWithData.length > 0

	return (
		<div>
			<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="text-[28px] font-bold tracking-tight text-primary">
						Nightly Performance Trends
					</h2>
					<p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-secondary">
						Throughput, TPS, and Engine API newPayload latency distribution for
						internal nightly builds. Each point is the latest benchmark for one
						workload on one day.
					</p>
				</div>
				<div className="flex rounded-lg border border-border bg-surface p-1">
					{PERIODS.map((option) => (
						<Link
							key={option.value}
							to="/trends"
							search={{ period: option.value }}
							className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
								option.value === period
									? 'bg-accent-muted text-accent'
									: 'text-secondary hover:text-primary'
							}`}
						>
							{option.label}
						</Link>
					))}
				</div>
			</div>

			{hasRuns && xDomain ? (
				<section className="space-y-12">
					{historiesWithData.map((history) => (
						<TrendRow
							key={history.scenario.id}
							history={history}
							xDomain={xDomain}
						/>
					))}
				</section>
			) : (
				<div className="card flex h-52 items-center justify-center p-5 text-[13px] text-tertiary">
					No nightly runs yet.
				</div>
			)}
		</div>
	)
}

function TrendRow(props: {
	history: ScenarioRunHistory
	xDomain: readonly [number, number]
}): React.JSX.Element {
	const runs = props.history.runs.filter((run) => {
		const timestamp = new Date(run.startedAt).getTime()
		return timestamp >= props.xDomain[0] && timestamp <= props.xDomain[1]
	})
	const latest = runs.at(-1)

	return (
		<section>
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h3 className="text-[20px] font-semibold text-primary">
						{props.history.scenario.label}
					</h3>
					<p className="mt-1 text-[13px] text-tertiary">
						{props.history.scenario.workload}
					</p>
					{latest && (
						<p className="mt-2 text-[12px] text-tertiary">
							{runs.length} daily points · latest {formatDate(latest.startedAt)}
						</p>
					)}
				</div>
				{latest && (
					<Link
						to="/benchmark/$id"
						params={{ id: latest.id }}
						className="text-[13px] font-medium text-accent hover:underline"
					>
						Open latest
					</Link>
				)}
			</div>

			<div className="space-y-4">
				<ScatterChart
					title="Throughput"
					runs={runs}
					xDomain={props.xDomain}
					leftLabel="TPS"
					rightLabel="Gas/s"
					metrics={[TPS_METRIC, GAS_METRIC]}
				/>
				<ScatterChart
					title="Engine API newPayload latency"
					runs={runs}
					xDomain={props.xDomain}
					leftLabel="Latency"
					metrics={LATENCY_METRICS}
				/>
			</div>
		</section>
	)
}

type TrendMetric = {
	key: string
	label: string
	color: string
	axis: 'left' | 'right'
	lowerIsBetter?: boolean | undefined
	getValue: (run: BenchRun) => number | null
	format: (value: number) => string
}

const TPS_METRIC: TrendMetric = {
	key: 'tps',
	label: 'TPS',
	color: COLORS.tps,
	axis: 'left',
	getValue: (run) => run.avgTps,
	format: formatTps,
}

const GAS_METRIC: TrendMetric = {
	key: 'gas',
	label: 'Gas/s',
	color: COLORS.gas,
	axis: 'right',
	getValue: (run) => run.avgGasPerSecond,
	format: formatGas,
}

const LATENCY_METRICS: Array<TrendMetric> = [
	{
		key: 'engine-mean',
		label: 'Mean',
		color: COLORS.mean,
		axis: 'left',
		lowerIsBetter: true,
		getValue: (run) => run.engineApiLatencyMeanMs,
		format: formatLatency,
	},
	{
		key: 'engine-p50',
		label: 'P50',
		color: COLORS.p50,
		axis: 'left',
		lowerIsBetter: true,
		getValue: (run) => run.engineApiLatencyP50Ms,
		format: formatLatency,
	},
	{
		key: 'engine-p90',
		label: 'P90',
		color: COLORS.p90,
		axis: 'left',
		lowerIsBetter: true,
		getValue: (run) => run.engineApiLatencyP90Ms,
		format: formatLatency,
	},
	{
		key: 'engine-p99',
		label: 'P99',
		color: COLORS.p99,
		axis: 'left',
		lowerIsBetter: true,
		getValue: (run) => run.engineApiLatencyP99Ms,
		format: formatLatency,
	},
]

const SVG_W = 640
const SVG_H = 180
const SVG_X_PAD = 8

type ChartPoint = {
	run: BenchRun
	x: number
}

function ScatterChart(props: {
	title: string
	runs: Array<BenchRun>
	xDomain: readonly [number, number]
	leftLabel: string
	rightLabel?: string | undefined
	metrics: Array<TrendMetric>
}): React.JSX.Element {
	const plotRef = React.useRef<HTMLDivElement>(null)
	const [hoverX, setHoverX] = React.useState<number | null>(null)
	const populatedMetrics = props.metrics.filter((metric) =>
		props.runs.some((run) => metric.getValue(run) != null),
	)
	const points = props.runs
		.filter((run) =>
			populatedMetrics.some((metric) => metric.getValue(run) != null),
		)
		.map((run) => ({
			run,
			x: new Date(run.startedAt).getTime(),
		}))

	if (points.length === 0 || populatedMetrics.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center rounded-lg border border-border-subtle text-[13px] text-tertiary">
				{props.title}: no data
			</div>
		)
	}

	const [xMin, xMax] = props.xDomain
	const xRange = xMax - xMin
	const leftMax = axisMax(props.runs, populatedMetrics, 'left')
	const rightMax = axisMax(props.runs, populatedMetrics, 'right')

	function sx(x: number): number {
		if (xRange === 0) return SVG_W / 2
		return SVG_X_PAD + ((x - xMin) / xRange) * (SVG_W - SVG_X_PAD * 2)
	}
	function sy(value: number, axis: 'left' | 'right'): number {
		const yMax = axis === 'right' ? rightMax : leftMax
		return SVG_H - (value / yMax) * SVG_H
	}
	function closestPoint(targetX: number): ChartPoint {
		let best = points[0]
		let bestDist = Math.abs(best.x - targetX)
		for (let i = 1; i < points.length; i++) {
			const dist = Math.abs(points[i].x - targetX)
			if (dist < bestDist) {
				best = points[i]
				bestDist = dist
			}
		}
		return best
	}
	function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
		const rect = plotRef.current?.getBoundingClientRect()
		if (!rect) return
		const frac = (event.clientX - rect.left) / rect.width
		if (frac < 0 || frac > 1) {
			setHoverX(null)
			return
		}
		setHoverX(xRange === 0 ? xMin : xMin + frac * xRange)
	}

	const hovered = hoverX == null ? null : closestPoint(hoverX)
	const hoverPct = hovered ? (sx(hovered.x) / SVG_W) * 100 : 0
	const tooltipNearRight = hoverPct > 70
	const rightMetric = populatedMetrics.find((metric) => metric.axis === 'right')
	const metricPaths = populatedMetrics.map((metric) => ({
		metric,
		points: points.flatMap((point) => {
			const value = metric.getValue(point.run)
			if (value == null) return []
			return `${sx(point.x)},${sy(value, metric.axis)}`
		}),
	}))

	return (
		<div className="rounded-lg border border-border-subtle p-4">
			<div className="mb-3 space-y-2">
				<div className="flex items-center justify-between gap-4">
					<p className="text-[12px] font-medium text-secondary">
						{props.title}
					</p>
					<div className="flex flex-wrap justify-end gap-3">
						{populatedMetrics.map((metric) => (
							<LegendItem key={metric.key} metric={metric} />
						))}
					</div>
				</div>
				<div className="flex flex-wrap gap-x-4 gap-y-1">
					{populatedMetrics.map((metric) => (
						<ChartDelta key={metric.key} metric={metric} runs={props.runs} />
					))}
				</div>
			</div>
			<div className="flex">
				<div className="flex w-20 shrink-0 flex-col justify-between pr-2 text-right">
					<span className="font-mono text-[10px] leading-none text-tertiary">
						{formatAxisValue(leftMax, populatedMetrics, 'left')}
					</span>
					<span className="font-mono text-[10px] leading-none text-tertiary">
						{formatAxisValue(leftMax / 2, populatedMetrics, 'left')}
					</span>
					<span className="font-mono text-[10px] leading-none text-tertiary">
						0 {props.leftLabel}
					</span>
				</div>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: chart hover */}
				<div
					ref={plotRef}
					className="relative min-w-0 flex-1"
					onMouseMove={handleMouseMove}
					onMouseLeave={() => setHoverX(null)}
				>
					<svg
						viewBox={`0 0 ${SVG_W} ${SVG_H}`}
						className="block w-full"
						preserveAspectRatio="none"
						role="img"
						aria-label={props.title}
						style={{ height: 180 }}
					>
						{[0.25, 0.5, 0.75].map((frac) => (
							<line
								key={frac}
								x1={0}
								y1={SVG_H * (1 - frac)}
								x2={SVG_W}
								y2={SVG_H * (1 - frac)}
								stroke="currentColor"
								className="text-border"
								vectorEffect="non-scaling-stroke"
								strokeWidth={0.5}
								strokeDasharray="3 3"
								opacity={0.5}
							/>
						))}
						<line
							x1={0}
							y1={SVG_H}
							x2={SVG_W}
							y2={SVG_H}
							stroke="currentColor"
							className="text-border"
							vectorEffect="non-scaling-stroke"
							strokeWidth={0.5}
						/>

						{metricPaths.map(
							({ metric, points: pathPoints }) =>
								pathPoints.length > 1 && (
									<polyline
										key={metric.key}
										fill="none"
										stroke={metric.color}
										vectorEffect="non-scaling-stroke"
										strokeWidth={1.5}
										strokeLinejoin="round"
										strokeLinecap="round"
										points={pathPoints.join(' ')}
									/>
								),
						)}

						{hovered && (
							<line
								x1={sx(hovered.x)}
								y1={0}
								x2={sx(hovered.x)}
								y2={SVG_H}
								stroke="currentColor"
								className="text-secondary"
								vectorEffect="non-scaling-stroke"
								strokeWidth={0.5}
								strokeDasharray="3 3"
							/>
						)}
					</svg>

					{points.flatMap((point) =>
						populatedMetrics.flatMap((metric) => {
							const value = metric.getValue(point.run)
							if (value == null) return []
							return [
								<ChartDot
									key={`${point.run.id}-${metric.key}`}
									color={metric.color}
									left={(sx(point.x) / SVG_W) * 100}
									top={(sy(value, metric.axis) / SVG_H) * 100}
								/>,
							]
						}),
					)}

					{hovered && (
						<div
							className="pointer-events-none absolute top-2 z-10 rounded-lg border border-border bg-surface px-3 py-2 text-[11px] shadow-lg whitespace-nowrap"
							style={{
								left: `${hoverPct}%`,
								transform: tooltipNearRight
									? 'translateX(-100%)'
									: 'translateX(0%)',
							}}
						>
							<div className="mb-1 font-mono text-tertiary">
								{formatDate(hovered.run.startedAt)}
								{hovered.run.ref ? ` · ${hovered.run.ref}` : ''}
							</div>
							{populatedMetrics.map((metric) => {
								const value = metric.getValue(hovered.run)
								if (value == null) return null
								return (
									<TooltipMetric
										key={metric.key}
										color={metric.color}
										label={metric.label}
										value={metric.format(value)}
									/>
								)
							})}
						</div>
					)}
				</div>
				{rightMetric && props.rightLabel && (
					<div className="flex w-24 shrink-0 flex-col justify-between pl-2 text-left">
						<span className="font-mono text-[10px] leading-none text-tertiary">
							{rightMetric.format(rightMax)}
						</span>
						<span className="font-mono text-[10px] leading-none text-tertiary">
							{rightMetric.format(rightMax / 2)}
						</span>
						<span className="font-mono text-[10px] leading-none text-tertiary">
							0 {props.rightLabel}
						</span>
					</div>
				)}
			</div>
			<div className="mt-1 flex justify-between pl-20 pr-24">
				<span className="font-mono text-[10px] text-tertiary">
					{formatShortDate(xMin)}
				</span>
				<span className="font-mono text-[10px] text-tertiary">
					{formatShortDate(xMax)}
				</span>
			</div>
		</div>
	)
}

function axisMax(
	runs: Array<BenchRun>,
	metrics: Array<TrendMetric>,
	axis: 'left' | 'right',
): number {
	const values = metrics
		.filter((metric) => metric.axis === axis)
		.flatMap((metric) => runs.map((run) => metric.getValue(run)))
		.filter((value): value is number => value != null)
	return Math.max(...values, 1) * 1.1
}

function formatAxisValue(
	value: number,
	metrics: Array<TrendMetric>,
	axis: 'left' | 'right',
): string {
	const metric = metrics.find((candidate) => candidate.axis === axis)
	return metric ? metric.format(value) : Math.round(value).toLocaleString()
}

function LegendItem(props: { metric: TrendMetric }): React.JSX.Element {
	return (
		<div className="flex items-center gap-1.5">
			<span
				className="inline-block h-2.5 w-2.5 rounded-full"
				style={{ backgroundColor: props.metric.color }}
			/>
			<span className="text-[11px] text-secondary">{props.metric.label}</span>
		</div>
	)
}

function ChartDelta(props: {
	metric: TrendMetric
	runs: Array<BenchRun>
}): React.JSX.Element {
	const stats = metricStats(props.runs, props.metric)
	return (
		<div className="flex items-center gap-1.5 text-[11px] text-tertiary">
			<span className="text-secondary">{props.metric.label}</span>
			<span>period</span>
			<span
				className={deltaClassName(
					stats.periodChange,
					props.metric.lowerIsBetter,
				)}
			>
				{formatDelta(stats.periodChange)}
			</span>
			<span>nightly</span>
			<span
				className={deltaClassName(
					stats.avgNightlyDelta,
					props.metric.lowerIsBetter,
				)}
			>
				{formatDelta(stats.avgNightlyDelta)}
			</span>
		</div>
	)
}

function metricStats(runs: Array<BenchRun>, metric: TrendMetric) {
	const points = runs
		.map((run) => ({ value: metric.getValue(run) }))
		.filter((point): point is { value: number } => point.value != null)

	const first = points[0]?.value
	const last = points.at(-1)?.value
	const periodChange = first && last != null ? (last - first) / first : null
	const deltas: Array<number> = []
	for (let i = 1; i < points.length; i++) {
		const previous = points[i - 1].value
		const current = points[i].value
		if (previous !== 0) deltas.push((current - previous) / previous)
	}
	const avgNightlyDelta = deltas.length
		? deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length
		: null

	return {
		periodChange,
		avgNightlyDelta,
	}
}

function formatDelta(value: number | null): string {
	if (value == null || !Number.isFinite(value)) return '—'
	const pct = value * 100
	const sign = pct > 0 ? '+' : ''
	return `${sign}${pct.toFixed(1)}%`
}

function deltaClassName(
	value: number | null | undefined,
	lowerIsBetter: boolean | undefined,
): string {
	if (value == null || Math.abs(value) < 0.0001)
		return 'font-mono text-tertiary'
	const improved = lowerIsBetter ? value < 0 : value > 0
	return `font-mono ${improved ? 'text-positive' : 'text-negative'}`
}

function ChartDot(props: {
	color: string
	left: number
	top: number
}): React.JSX.Element {
	return (
		<div
			className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-surface"
			style={{
				left: `${props.left}%`,
				top: `${props.top}%`,
				backgroundColor: props.color,
			}}
		/>
	)
}

function TooltipMetric(props: {
	color: string
	label: string
	value: string
}): React.JSX.Element {
	return (
		<div className="flex items-center gap-1.5">
			<span
				className="inline-block h-2 w-2 rounded-full"
				style={{ backgroundColor: props.color }}
			/>
			<span className="text-secondary">{props.label}:</span>
			<span className="font-mono font-medium text-primary">{props.value}</span>
		</div>
	)
}

function formatLatency(value: number | null): string {
	if (value == null) return '—'
	if (value >= 1000) return `${(value / 1000).toFixed(2)}s`
	if (value >= 10) return `${value.toFixed(1)}ms`
	return `${value.toFixed(2)}ms`
}

function formatShortDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}
