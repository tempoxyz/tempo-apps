import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery, useQuery } from '@tanstack/react-query'
import {
	getScenario,
	fetchRun,
	fetchMetrics,
	fetchBlocks,
	type MetricSeries,
} from '#lib/server/bench'
import { formatGas, formatTps, formatMs, formatDate } from '#lib/format'

const METRIC_NAMES = [
	// Builder phases (p50)
	'reth_tempo_payload_builder_payload_build_duration_seconds',
	'reth_tempo_payload_builder_pool_fetch_duration_seconds',
	'reth_tempo_payload_builder_total_transaction_execution_duration_seconds',
	'reth_tempo_payload_builder_state_root_with_updates_duration_seconds',
	'reth_tempo_payload_builder_payload_finalization_duration_seconds',
	'reth_tempo_payload_builder_state_setup_duration_seconds',
	'reth_tempo_payload_builder_hashed_post_state_duration_seconds',
	'reth_tempo_payload_builder_prepare_system_transactions_duration_seconds',
	'reth_tempo_payload_builder_system_transactions_execution_duration_seconds',
	// Throughput
	'reth_tempo_payload_builder_total_transactions_last',
	// Block headroom
	'reth_tempo_payload_builder_gas_used_last',
	'reth_tempo_payload_builder_general_gas_limit_last',
	'reth_tempo_payload_builder_rlp_block_size_bytes_last',
	// Txgen
	'txgen_transactions_sent_total',
	'txgen_transactions_success_total',
	'txgen_transactions_failed_total',
	'txgen_transactions_inflight',
	// Txpool
	'reth_transaction_pool_pending_pool_transactions',
	'reth_transaction_pool_basefee_pool_transactions',
	'reth_transaction_pool_queued_pool_transactions',
	// Skipped txs
	'reth_tempo_payload_builder_pool_transactions_skipped_total',
	// Persistence
	'reth_storage_providers_database_save_blocks_write_state',
	'reth_storage_providers_database_save_blocks_write_trie_updates',
	// Cache
	'reth_sync_caching_account_cache_hits',
	'reth_sync_caching_account_cache_misses',
	'reth_sync_caching_storage_cache_hits',
	'reth_sync_caching_storage_cache_misses',
	// Memory
	'reth_jemalloc_resident',
	'reth_jemalloc_allocated',
]

const COLORS = {
	blue: '#60a5fa',
	green: '#30a46c',
	orange: '#e2a336',
	red: '#e5484d',
	purple: '#a78bfa',
}

export const Route = createFileRoute('/benchmark/$id')({
	component: RunDetailPage,
	loader: ({ params, context }) => {
		context.queryClient.ensureQueryData({
			queryKey: ['run', params.id],
			queryFn: () => fetchRun({ data: params.id }),
		})
	},
})

function findSeries(
	metrics: Array<MetricSeries>,
	name: string,
	labelFilter?: Record<string, string>,
): MetricSeries | undefined {
	return metrics.find((m) => {
		if (m.name !== name) return false
		if (!labelFilter) return true
		const parsed = JSON.parse(m.labels) as Record<string, string>
		return Object.entries(labelFilter).every(([k, v]) => parsed[k] === v)
	})
}

function RunDetailPage(): React.JSX.Element {
	const { id } = Route.useParams()
	const { data: run } = useSuspenseQuery({
		queryKey: ['run', id],
		queryFn: () => fetchRun({ data: id }),
	})

	const { data: metrics } = useQuery({
		queryKey: ['metrics', id],
		queryFn: () => fetchMetrics({ data: { runId: id, metrics: METRIC_NAMES } }),
		enabled: !!run,
	})

	const { data: blocks } = useQuery({
		queryKey: ['blocks', id],
		queryFn: () => fetchBlocks({ data: id }),
		enabled: !!run,
	})

	if (!run) {
		return (
			<div className="py-20 text-center text-secondary">
				Benchmark not found.
			</div>
		)
	}

	const scenario = getScenario(run.scenarioId)
	const m = metrics ?? []

	// Builder phases (p50)
	const buildDurP50 = findSeries(
		m,
		'reth_tempo_payload_builder_payload_build_duration_seconds',
		{ quantile: '0.5' },
	)
	const buildDurP95 = findSeries(
		m,
		'reth_tempo_payload_builder_payload_build_duration_seconds',
		{ quantile: '0.95' },
	)
	const poolFetchSeries = findSeries(
		m,
		'reth_tempo_payload_builder_pool_fetch_duration_seconds',
		{ quantile: '0.5' },
	)
	const txExecSeries = findSeries(
		m,
		'reth_tempo_payload_builder_total_transaction_execution_duration_seconds',
		{ quantile: '0.5' },
	)
	const stateRootSeries = findSeries(
		m,
		'reth_tempo_payload_builder_state_root_with_updates_duration_seconds',
		{ quantile: '0.5' },
	)
	const finalizationSeries = findSeries(
		m,
		'reth_tempo_payload_builder_payload_finalization_duration_seconds',
		{ quantile: '0.5' },
	)
	const stateSetupSeries = findSeries(
		m,
		'reth_tempo_payload_builder_state_setup_duration_seconds',
		{ quantile: '0.5' },
	)
	const hashedPostStateSeries = findSeries(
		m,
		'reth_tempo_payload_builder_hashed_post_state_duration_seconds',
		{ quantile: '0.5' },
	)
	const sysTxPrepSeries = findSeries(
		m,
		'reth_tempo_payload_builder_prepare_system_transactions_duration_seconds',
		{ quantile: '0.5' },
	)
	const sysTxExecSeries = findSeries(
		m,
		'reth_tempo_payload_builder_system_transactions_execution_duration_seconds',
		{ quantile: '0.5' },
	)

	// Throughput
	const txsPerBlockSeries = findSeries(
		m,
		'reth_tempo_payload_builder_total_transactions_last',
	)

	// Block headroom
	const gasUsedSeries = findSeries(
		m,
		'reth_tempo_payload_builder_gas_used_last',
	)
	const generalGasLimitSeries = findSeries(
		m,
		'reth_tempo_payload_builder_general_gas_limit_last',
	)

	const rlpSizeSeries = findSeries(
		m,
		'reth_tempo_payload_builder_rlp_block_size_bytes_last',
	)

	// Txgen
	const txgenSentSeries = findSeries(m, 'txgen_transactions_sent_total')
	const txgenSuccessSeries = findSeries(m, 'txgen_transactions_success_total')
	const txgenFailedSeries = findSeries(m, 'txgen_transactions_failed_total')
	const txgenInflightSeries = findSeries(m, 'txgen_transactions_inflight')

	// Txpool
	const pendingSeries = findSeries(
		m,
		'reth_transaction_pool_pending_pool_transactions',
	)
	const basefeeSeries = findSeries(
		m,
		'reth_transaction_pool_basefee_pool_transactions',
	)
	const queuedSeries = findSeries(
		m,
		'reth_transaction_pool_queued_pool_transactions',
	)

	// Skipped txs
	const skippedNonceSeries = findSeries(
		m,
		'reth_tempo_payload_builder_pool_transactions_skipped_total',
		{ reason: 'nonce_too_low' },
	)
	const skippedInvalidSeries = findSeries(
		m,
		'reth_tempo_payload_builder_pool_transactions_skipped_total',
		{ reason: 'invalid_tx' },
	)
	const skippedSenderSeries = findSeries(
		m,
		'reth_tempo_payload_builder_pool_transactions_skipped_total',
		{ reason: 'sender_address_mismatch' },
	)

	// Persistence
	const writeStateSeries = findSeries(
		m,
		'reth_storage_providers_database_save_blocks_write_state',
		{ quantile: '0.5' },
	)
	const writeTrieSeries = findSeries(
		m,
		'reth_storage_providers_database_save_blocks_write_trie_updates',
		{ quantile: '0.5' },
	)

	// Cache
	const accountHitsSeries = findSeries(
		m,
		'reth_sync_caching_account_cache_hits',
	)
	const accountMissesSeries = findSeries(
		m,
		'reth_sync_caching_account_cache_misses',
	)
	const storageHitsSeries = findSeries(
		m,
		'reth_sync_caching_storage_cache_hits',
	)
	const storageMissesSeries = findSeries(
		m,
		'reth_sync_caching_storage_cache_misses',
	)

	// Memory
	const residentSeries = findSeries(m, 'reth_jemalloc_resident')
	const allocatedSeries = findSeries(m, 'reth_jemalloc_allocated')

	// Derived: gas fill %
	const gasFillData = gaugeRatio(gasUsedSeries, generalGasLimitSeries)

	return (
		<div>
			<div className="mb-4">
				{scenario ? (
					<Link
						to="/workload/$id"
						params={{ id: scenario.id }}
						className="text-[13px] text-tertiary transition-colors hover:text-primary"
					>
						← {scenario.label}
					</Link>
				) : (
					<Link
						to="/"
						className="text-[13px] text-tertiary transition-colors hover:text-primary"
					>
						← Dashboard
					</Link>
				)}
			</div>

			<section className="mb-8">
				<h2 className="text-[22px] font-bold tracking-tight text-primary">
					{run.commit ? (
						<>
							Benchmark{' '}
							<code className="font-mono text-[20px] text-accent">
								{run.commit}
							</code>
						</>
					) : (
						<>Benchmark — {formatDate(run.startedAt)}</>
					)}
				</h2>
				<p className="mt-2 text-[14px] text-secondary">
					{formatDate(run.startedAt)} · {run.blockCount} blocks
					{scenario && ` · ${scenario.workload}`}
				</p>
			</section>

			<section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
				<MetricCard
					label="Throughput"
					value={formatGas(run.avgGasPerSecond)}
					accent
				/>
				<MetricCard label="Peak" value={formatGas(run.peakGasPerSecond)} />
				<MetricCard label="Avg TPS" value={formatTps(run.avgTps)} />
				<MetricCard label="Block Time" value={formatMs(run.avgBlockTimeMs)} />
				<MetricCard label="Blocks" value={run.blockCount.toLocaleString()} />
			</section>

			{blocks && blocks.length > 0 && (
				<section className="mb-10">
					<SectionHeader title="Blocks" />
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<TimeSeriesChart
							title="Transactions per Block"
							showMean
							series={[
								{
									label: 'Tx Count',
									color: COLORS.blue,
									data: blocks.map((b) => ({
										x: b.index,
										y: b.txCount,
									})),
								},
							]}
							formatValue={(v) => `${Math.round(v).toLocaleString()} txs`}
							xFormat="block"
						/>
						<TimeSeriesChart
							title="Gas Used per Block"
							showMean
							series={[
								{
									label: 'Gas Used',
									color: COLORS.green,
									data: blocks.map((b) => ({
										x: b.index,
										y: b.gasUsed,
									})),
								},
							]}
							formatValue={(v) => formatGas(v, false)}
							xFormat="block"
						/>
					</div>
				</section>
			)}

			<section className="mb-10">
				<SectionHeader title="Payload Build Duration" />
				<TimeSeriesChart
					showMean
					series={[
						{
							label: 'p50',
							color: COLORS.blue,
							data: transformSamples(buildDurP50, (v) => v * 1000),
						},
						{
							label: 'p95',
							color: COLORS.orange,
							data: transformSamples(buildDurP95, (v) => v * 1000),
						},
					]}
					formatValue={(v) => `${v.toFixed(1)} ms`}
				/>
			</section>

			<section className="mb-10">
				<SectionHeader title="Block Builder Phases (p50)" />
				<TimeSeriesChart
					stacked
					showMean
					series={[
						{
							label: 'Pool Fetch',
							color: COLORS.orange,
							data: transformSamples(poolFetchSeries, (v) => v * 1000),
						},
						{
							label: 'Tx Execution',
							color: COLORS.blue,
							data: transformSamples(txExecSeries, (v) => v * 1000),
						},
						{
							label: 'State Root',
							color: COLORS.green,
							data: transformSamples(stateRootSeries, (v) => v * 1000),
						},
					]}
					formatValue={(v) => `${v.toFixed(1)} ms`}
				/>
			</section>

			<section className="mb-10">
				<SectionHeader title="Other Builder Phases (p50)" />
				<TimeSeriesChart
					stacked
					series={[
						{
							label: 'State Setup',
							color: COLORS.blue,
							data: transformSamples(stateSetupSeries, (v) => v * 1000),
						},
						{
							label: 'System Tx Prep',
							color: COLORS.orange,
							data: transformSamples(sysTxPrepSeries, (v) => v * 1000),
						},
						{
							label: 'System Tx Exec',
							color: COLORS.red,
							data: transformSamples(sysTxExecSeries, (v) => v * 1000),
						},
						{
							label: 'Finalization',
							color: COLORS.green,
							data: transformSamples(finalizationSeries, (v) => v * 1000),
						},
						{
							label: 'Hashed Post State',
							color: COLORS.purple,
							data: transformSamples(hashedPostStateSeries, (v) => v * 1000),
						},
					]}
					formatValue={(v) => `${v.toFixed(2)} ms`}
				/>
			</section>

			<section className="mb-10">
				<SectionHeader title="Throughput" />
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<TimeSeriesChart
						title="Gas Throughput"
						showMean
						series={[
							{
								label: 'Gas/s',
								color: COLORS.blue,
								data: (blocks ?? [])
									.filter((b) => b.blockTimeMs > 0)
									.map((b) => ({
										x: b.index,
										y: (b.gasUsed * 1000) / b.blockTimeMs / 1e9,
									})),
							},
						]}
						formatValue={(v) => `${v.toFixed(2)} Ggas/s`}
						xFormat="block"
					/>
					<TimeSeriesChart
						title="Txs per Block"
						showMean
						series={[
							{
								label: 'Txs',
								color: COLORS.green,
								data: transformSamples(txsPerBlockSeries),
							},
						]}
						formatValue={(v) => `${Math.round(v).toLocaleString()}`}
					/>
				</div>
			</section>

			<section className="mb-10">
				<SectionHeader title="Block Headroom" />
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<TimeSeriesChart
						title="Gas Fill %"
						showMean
						series={[
							{
								label: 'Fill %',
								color: COLORS.blue,
								data: gasFillData,
							},
						]}
						formatValue={(v) => `${v.toFixed(1)}%`}
					/>
					<TimeSeriesChart
						title="RLP Block Size"
						showMean
						series={[
							{
								label: 'Size',
								color: COLORS.green,
								data: transformSamples(rlpSizeSeries, (v) => v / 1024),
							},
						]}
						formatValue={(v) => `${v.toFixed(0)} KB`}
					/>
				</div>
			</section>

			<section className="mb-10">
				<SectionHeader title="Txgen" />
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<TimeSeriesChart
						title="Send Rate"
						showMean
						series={[
							{
								label: 'Sent',
								color: COLORS.blue,
								data: counterRate(txgenSentSeries),
							},
							{
								label: 'Success',
								color: COLORS.green,
								data: counterRate(txgenSuccessSeries),
							},
							{
								label: 'Failed',
								color: COLORS.red,
								data: counterRate(txgenFailedSeries),
							},
						]}
						formatValue={(v) => `${Math.round(v).toLocaleString()}/s`}
					/>
					<TimeSeriesChart
						title="Inflight"
						series={[
							{
								label: 'Inflight',
								color: COLORS.purple,
								data: transformSamples(txgenInflightSeries),
							},
						]}
						formatValue={(v) => Math.round(v).toLocaleString()}
					/>
				</div>
			</section>

			<section className="mb-10">
				<SectionHeader title="Txpool" />
				<TimeSeriesChart
					stacked
					showMean
					series={[
						{
							label: 'Basefee',
							color: COLORS.orange,
							data: transformSamples(basefeeSeries),
						},
						{
							label: 'Queued',
							color: COLORS.purple,
							data: transformSamples(queuedSeries),
						},
						{
							label: 'Pending',
							color: COLORS.blue,
							data: transformSamples(pendingSeries),
						},
					]}
					formatValue={(v) => `${Math.round(v).toLocaleString()} txs`}
				/>
			</section>

			<section className="mb-10">
				<SectionHeader title="Skipped Transactions" />
				<TimeSeriesChart
					series={[
						{
							label: 'Nonce Too Low',
							color: COLORS.orange,
							data: counterRate(skippedNonceSeries),
						},
						{
							label: 'Invalid Tx',
							color: COLORS.red,
							data: counterRate(skippedInvalidSeries),
						},
						{
							label: 'Sender Mismatch',
							color: COLORS.purple,
							data: counterRate(skippedSenderSeries),
						},
					]}
					formatValue={(v) => `${Math.round(v).toLocaleString()}/s`}
				/>
			</section>

			<section className="mb-10">
				<SectionHeader title="Persistence (p50)" />
				<TimeSeriesChart
					series={[
						{
							label: 'Write State',
							color: COLORS.blue,
							data: transformSamples(writeStateSeries, (v) => v * 1000),
						},
						{
							label: 'Write Trie Updates',
							color: COLORS.green,
							data: transformSamples(writeTrieSeries, (v) => v * 1000),
						},
					]}
					formatValue={(v) => `${v.toFixed(2)} ms`}
				/>
			</section>

			<section className="mb-10">
				<SectionHeader title="Cache Hit Rates" />
				<TimeSeriesChart
					series={[
						{
							label: 'Account Cache',
							color: COLORS.blue,
							data: cacheHitRate(accountHitsSeries, accountMissesSeries),
						},
						{
							label: 'Storage Cache',
							color: COLORS.green,
							data: cacheHitRate(storageHitsSeries, storageMissesSeries),
						},
					]}
					formatValue={(v) => `${v.toFixed(1)}%`}
					yMax={100}
				/>
			</section>

			<section className="mb-14">
				<SectionHeader title="Memory" />
				<TimeSeriesChart
					series={[
						{
							label: 'Resident',
							color: COLORS.blue,
							data: transformSamples(residentSeries),
						},
						{
							label: 'Allocated',
							color: COLORS.green,
							data: transformSamples(allocatedSeries),
						},
					]}
					formatValue={formatBytes}
				/>
			</section>
		</div>
	)
}

type ChartPoint = { x: number; y: number }

type ChartSeries = {
	label: string
	color: string
	data: Array<ChartPoint>
}

function transformSamples(
	series: MetricSeries | undefined,
	transform?: (v: number) => number,
): Array<ChartPoint> {
	if (!series) return []
	return series.samples.map((s) => ({
		x: s.offsetMs / 1000,
		y: transform ? transform(s.value) : s.value,
	}))
}

function formatBytes(bytes: number): string {
	if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
	if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
	if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
	return `${Math.round(bytes)} B`
}

/** Compute per-second rate from a cumulative counter series. */
function counterRate(series: MetricSeries | undefined): Array<ChartPoint> {
	if (!series || series.samples.length < 2) return []
	const points: Array<ChartPoint> = []
	for (let i = 1; i < series.samples.length; i++) {
		const dt =
			(series.samples[i].offsetMs - series.samples[i - 1].offsetMs) / 1000
		const dv = series.samples[i].value - series.samples[i - 1].value
		points.push({
			x: series.samples[i].offsetMs / 1000,
			y: dt > 0 ? dv / dt : 0,
		})
	}
	return points
}

/** Compute point-wise a / (a + b) * 100 from two cumulative counter series (windowed hit rate). */
function cacheHitRate(
	hits: MetricSeries | undefined,
	misses: MetricSeries | undefined,
): Array<ChartPoint> {
	if (!hits || !misses) return []
	const len = Math.min(hits.samples.length, misses.samples.length)
	const points: Array<ChartPoint> = []
	for (let i = 1; i < len; i++) {
		const dh = hits.samples[i].value - hits.samples[i - 1].value
		const dm = misses.samples[i].value - misses.samples[i - 1].value
		const total = dh + dm
		points.push({
			x: hits.samples[i].offsetMs / 1000,
			y: total > 0 ? (dh / total) * 100 : 100,
		})
	}
	return points
}

/** Derive point-wise ratio (a / b * 100) from two gauge series. */
function gaugeRatio(
	a: MetricSeries | undefined,
	b: MetricSeries | undefined,
): Array<ChartPoint> {
	if (!a || !b) return []
	const len = Math.min(a.samples.length, b.samples.length)
	const points: Array<ChartPoint> = []
	for (let i = 0; i < len; i++) {
		const bv = b.samples[i].value
		points.push({
			x: a.samples[i].offsetMs / 1000,
			y: bv > 0 ? (a.samples[i].value / bv) * 100 : 0,
		})
	}
	return points
}

function SectionHeader(props: { title: string }): React.JSX.Element {
	return (
		<div className="mb-4 flex items-center gap-3">
			<h3 className="text-[13px] font-normal uppercase tracking-wider text-tertiary">
				{props.title}
			</h3>
			<div className="h-px flex-1 bg-border" />
		</div>
	)
}

function MetricCard(props: {
	label: string
	value: string
	accent?: boolean | undefined
}): React.JSX.Element {
	return (
		<div className="card p-4">
			<p className="text-[11px] font-normal uppercase tracking-wider text-tertiary">
				{props.label}
			</p>
			<p
				className={`mt-1 font-mono text-[18px] font-semibold ${props.accent ? 'text-accent' : 'text-primary'}`}
			>
				{props.value}
			</p>
		</div>
	)
}

const SVG_W = 500
const SVG_H = 160

function defaultFormatValue(v: number): string {
	if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
	if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`
	if (Number.isInteger(v)) return v.toString()
	return v.toFixed(v < 10 ? 2 : 1)
}

function seriesMean(data: Array<ChartPoint>): number {
	if (data.length === 0) return 0
	return data.reduce((sum, p) => sum + p.y, 0) / data.length
}

function TimeSeriesChart(props: {
	series: Array<ChartSeries>
	title?: string | undefined
	stacked?: boolean | undefined
	showMean?: boolean | undefined
	formatValue?: ((v: number) => string) | undefined
	xFormat?: 'time' | 'block' | undefined
	yMax?: number | undefined
}): React.JSX.Element {
	const plotRef = React.useRef<HTMLDivElement>(null)
	const [hoverX, setHoverX] = React.useState<number | null>(null)

	const fmtVal = props.formatValue ?? defaultFormatValue

	const allPoints = props.series.flatMap((s) => s.data)
	if (allPoints.length === 0) {
		return (
			<div className="card flex h-52 items-center justify-center p-5 text-[13px] text-tertiary">
				{props.title && (
					<span className="mr-1 font-medium text-secondary">
						{props.title}:
					</span>
				)}{' '}
				No data
			</div>
		)
	}

	const refSeries = props.series.reduce(
		(a, b) => (b.data.length > a.data.length ? b : a),
		props.series[0],
	)
	const xMin = refSeries.data[0]?.x ?? 0
	const xMax = refSeries.data.at(-1)?.x ?? 1
	const xRange = xMax - xMin || 1

	let yMax: number
	if (props.yMax != null) {
		yMax = props.yMax
	} else if (props.stacked) {
		const sums: Array<number> = []
		for (let i = 0; i < refSeries.data.length; i++) {
			let sum = 0
			for (const s of props.series) sum += s.data[i]?.y ?? 0
			sums.push(sum)
		}
		yMax = (Math.max(...sums) || 1) * 1.1
	} else {
		yMax = (Math.max(...allPoints.map((p) => p.y)) || 1) * 1.1
	}
	const yMin = 0
	const yRange = yMax - yMin || 1

	function sx(x: number): number {
		return ((x - xMin) / xRange) * SVG_W
	}
	function sy(y: number): number {
		return SVG_H - ((y - yMin) / yRange) * SVG_H
	}

	// Stacked area paths (fill polygon + top-edge stroke separately)
	const stackedAreas: Array<{
		label: string
		color: string
		fill: string
		stroke: string
	}> = []
	if (props.stacked) {
		const baseLine = refSeries.data.map(() => 0)
		for (const s of props.series) {
			const topLine = s.data.map((p, i) => (baseLine[i] ?? 0) + p.y)
			const forward = s.data
				.map((p, i) => `${sx(p.x)},${sy(topLine[i])}`)
				.join(' L')
			const backward = [...s.data]
				.map((p, i) => `${sx(p.x)},${sy(baseLine[i] ?? 0)}`)
				.reverse()
				.join(' L')
			stackedAreas.push({
				label: s.label,
				color: s.color,
				fill: `M${forward} L${backward} Z`,
				stroke: `M${forward}`,
			})
			for (let i = 0; i < topLine.length; i++) baseLine[i] = topLine[i]
		}
	}

	const means = props.series.map((s) => seriesMean(s.data))

	function closestPoint(
		data: Array<ChartPoint>,
		targetX: number,
	): ChartPoint | null {
		if (data.length === 0) return null
		let best = data[0]
		let bestDist = Math.abs(best.x - targetX)
		for (let i = 1; i < data.length; i++) {
			const dist = Math.abs(data[i].x - targetX)
			if (dist < bestDist) {
				best = data[i]
				bestDist = dist
			}
		}
		return best
	}

	function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
		const rect = plotRef.current?.getBoundingClientRect()
		if (!rect || refSeries.data.length === 0) return
		const frac = (e.clientX - rect.left) / rect.width
		if (frac < 0 || frac > 1) {
			setHoverX(null)
			return
		}
		setHoverX(xMin + frac * xRange)
	}

	const hoverPct =
		hoverX !== null ? ((sx(hoverX) / SVG_W) * 100).toFixed(1) : '0'
	const tooltipNearRight = hoverX !== null && sx(hoverX) / SVG_W > 0.7

	return (
		<div className="card overflow-visible p-5">
			{props.title && (
				<p className="mb-3 text-[12px] font-medium text-secondary">
					{props.title}
				</p>
			)}
			<div>
				<div className="flex">
					{/* Y-axis labels (HTML, fixed pixel size) */}
					<div className="flex w-20 shrink-0 flex-col justify-between pr-2 text-right">
						<span className="font-mono text-[10px] leading-none text-tertiary">
							{fmtVal(yMax)}
						</span>
						<span className="font-mono text-[10px] leading-none text-tertiary">
							{fmtVal((yMax + yMin) / 2)}
						</span>
						<span className="font-mono text-[10px] leading-none text-tertiary">
							{fmtVal(yMin)}
						</span>
					</div>

					{/* Plot area */}
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
							aria-label={props.title ?? 'Time series chart'}
							style={{ height: 160 }}
						>
							{/* Horizontal grid */}
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
							{/* Bottom axis */}
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

							{/* Mean lines */}
							{props.showMean &&
								(props.stacked ? (
									<line
										x1={0}
										y1={sy(means.reduce((a, b) => a + b, 0))}
										x2={SVG_W}
										y2={sy(means.reduce((a, b) => a + b, 0))}
										stroke="currentColor"
										className="text-secondary"
										vectorEffect="non-scaling-stroke"
										strokeWidth={0.5}
										strokeDasharray="4 3"
										opacity={0.6}
									/>
								) : (
									props.series.map((s, i) => (
										<line
											key={`mean-${s.label}`}
											x1={0}
											y1={sy(means[i])}
											x2={SVG_W}
											y2={sy(means[i])}
											stroke={s.color}
											vectorEffect="non-scaling-stroke"
											strokeWidth={0.5}
											strokeDasharray="4 3"
											opacity={0.6}
										/>
									))
								))}

							{/* Stacked area fills */}
							{props.stacked &&
								stackedAreas.map((a) => (
									<path
										key={`fill-${a.label}`}
										d={a.fill}
										fill={a.color}
										fillOpacity={0.25}
										stroke="none"
									/>
								))}
							{/* Stacked area top-edge strokes */}
							{props.stacked &&
								stackedAreas.map((a) => (
									<path
										key={`stroke-${a.label}`}
										d={a.stroke}
										fill="none"
										stroke={a.color}
										vectorEffect="non-scaling-stroke"
										strokeWidth={1.5}
										strokeLinejoin="round"
									/>
								))}

							{/* Line series (non-stacked) */}
							{!props.stacked &&
								props.series.map(
									(s) =>
										s.data.length > 1 && (
											<polyline
												key={s.label}
												fill="none"
												stroke={s.color}
												vectorEffect="non-scaling-stroke"
												strokeWidth={1.5}
												strokeLinejoin="round"
												strokeLinecap="round"
												points={s.data
													.map((p) => `${sx(p.x)},${sy(p.y)}`)
													.join(' ')}
											/>
										),
								)}

							{/* Hover crosshair */}
							{hoverX !== null && (
								<line
									x1={sx(hoverX)}
									y1={0}
									x2={sx(hoverX)}
									y2={SVG_H}
									stroke="currentColor"
									className="text-secondary"
									vectorEffect="non-scaling-stroke"
									strokeWidth={0.5}
									strokeDasharray="3 3"
								/>
							)}

							{/* Hover dots */}
							{hoverX !== null &&
								props.series.map((s) => {
									const pt = closestPoint(s.data, hoverX)
									if (!pt) return null
									let y = pt.y
									if (props.stacked) {
										const si = props.series.indexOf(s)
										y = 0
										for (let j = 0; j <= si; j++) {
											const cp = closestPoint(props.series[j].data, hoverX)
											y += cp?.y ?? 0
										}
									}
									return (
										<circle
											key={s.label}
											cx={sx(pt.x)}
											cy={sy(y)}
											r={3}
											fill={s.color}
											stroke="currentColor"
											className="text-surface"
											vectorEffect="non-scaling-stroke"
											strokeWidth={1.5}
										/>
									)
								})}
						</svg>

						{/* Hover tooltip */}
						{hoverX !== null && (
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
									{props.xFormat === 'block'
										? `Block ${Math.round(hoverX)}`
										: `${Math.round(hoverX)}s`}
								</div>
								{props.series.map((s) => {
									const pt = closestPoint(s.data, hoverX)
									if (!pt) return null
									return (
										<div key={s.label} className="flex items-center gap-1.5">
											<span
												className="inline-block h-2 w-2 rounded-full"
												style={{ backgroundColor: s.color }}
											/>
											<span className="text-secondary">{s.label}:</span>
											<span className="font-mono font-medium text-primary">
												{fmtVal(pt.y)}
											</span>
										</div>
									)
								})}
								{props.stacked && (
									<div className="mt-1 flex items-center gap-1.5 border-t border-border pt-1">
										<span className="text-secondary">Total:</span>
										<span className="font-mono font-medium text-primary">
											{fmtVal(
												props.series.reduce(
													(sum, s) =>
														sum + (closestPoint(s.data, hoverX)?.y ?? 0),
													0,
												),
											)}
										</span>
									</div>
								)}
							</div>
						)}
					</div>
				</div>

				{/* X-axis labels (HTML, fixed pixel size) */}
				<div className="mt-1 flex justify-between pl-20">
					<span className="font-mono text-[10px] text-tertiary">
						{props.xFormat === 'block'
							? `Block ${Math.round(xMin)}`
							: `${Math.round(xMin)}s`}
					</span>
					<span className="font-mono text-[10px] text-tertiary">
						{props.xFormat === 'block'
							? `Block ${Math.round(xMax)}`
							: `${Math.round(xMax)}s`}
					</span>
				</div>
			</div>

			{/* Legend with mean values */}
			<div className="mt-3 flex flex-wrap gap-4">
				{props.series.map((s, i) => (
					<div key={s.label} className="flex items-center gap-1.5">
						<span
							className="inline-block h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: s.color }}
						/>
						<span className="text-[11px] text-secondary">
							{s.label}
							{props.showMean && (
								<span className="text-tertiary"> (avg {fmtVal(means[i])})</span>
							)}
						</span>
					</div>
				))}
			</div>
		</div>
	)
}
