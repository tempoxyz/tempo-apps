import { createServerFn } from '@tanstack/react-start'
import { queryClickHouse } from '#lib/server/clickhouse'

export type Scenario = {
	id: string
	label: string
	workload: string
}

export type BenchRun = {
	id: string
	scenarioId: string
	commit: string
	ref: string
	mode: string
	startedAt: string
	finishedAt: string
	config: Record<string, string>
	avgTps: number
	avgGasPerSecond: number
	peakGasPerSecond: number
	avgBlockTimeMs: number
	blockCount: number
	engineApiLatencyMeanMs: number | null
	engineApiLatencyP50Ms: number | null
	engineApiLatencyP90Ms: number | null
	engineApiLatencyP99Ms: number | null
}

export type RunFeed = 'release' | 'nightly'

export type RunsForScenarioInput = {
	scenarioId: string
	feed?: RunFeed | undefined
}

export type MetricSample = {
	offsetMs: number
	value: number
}

export type MetricSeries = {
	name: string
	labels: string
	samples: Array<MetricSample>
}

export type ScenarioRunHistory = {
	scenario: Scenario
	runs: Array<BenchRun>
}

type ScenarioConfig = Scenario & {
	scenarioName: string
}

const STATIC_SCENARIOS: Array<ScenarioConfig> = [
	{
		id: 'tip20-10k',
		label: 'TIP-20 — 10K TPS',
		workload: '100% TIP-20 Transfers',
		scenarioName: 'tip20-10k',
	},
	{
		id: 'tip20-20k',
		label: 'TIP-20 — 20K TPS',
		workload: '100% TIP-20 Transfers',
		scenarioName: 'tip20-20k',
	},
	{
		id: 'mix-10k',
		label: 'Mix — 10K TPS',
		workload:
			'70% TIP-20 Transfers, 10% MPP Channels, 10% DEX Swaps, 10% ERC-20 Transfers',
		scenarioName: 'mix-10k',
	},
	{
		id: 'mix-20k',
		label: 'Mix — 20K TPS',
		workload:
			'70% TIP-20 Transfers, 10% MPP Channels, 10% DEX Swaps, 10% ERC-20 Transfers',
		scenarioName: 'mix-20k',
	},
]

// Target maximum number of points returned per chart series. Large runs can
// contain enough raw block/metric samples to exceed Cloudflare Worker memory
// limits when serialized as JSON, so fetch queries aggregate samples into this
// many buckets before returning them to the app.
const CHART_POINT_TARGET = 750

function sqlString(value: string): string {
	return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

export function getScenarios(): Array<Scenario> {
	return STATIC_SCENARIOS.map(({ scenarioName: _, ...s }) => s)
}

export function getScenario(id: string): Scenario | undefined {
	const { scenarioName: _, ...scenario } = scenarioConfigFromName(id)
	return scenario
}

function scenarioFromConfig({
	scenarioName: _,
	...scenario
}: ScenarioConfig): Scenario {
	return scenario
}

function scenarioConfigFromName(scenarioName: string): ScenarioConfig {
	const known = STATIC_SCENARIOS.find((s) => s.scenarioName === scenarioName)
	if (known) return known

	const match = scenarioName.match(/^(.+?)-(\d+)(k)?$/i)
	const rawWorkload = match?.[1] ?? scenarioName
	const target = match ? Number(match[2]) * (match[3] ? 1_000 : 1) : null
	const workloadLabel = formatWorkloadLabel(rawWorkload)

	return {
		id: scenarioName,
		label: target
			? `${workloadLabel} — ${formatTargetTps(target)} TPS`
			: workloadLabel,
		workload: formatWorkloadDescription(rawWorkload),
		scenarioName,
	}
}

function formatWorkloadLabel(value: string): string {
	if (value === 'tip20') return 'TIP-20'
	if (value === 'mix') return 'Mix'
	return value
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ')
}

function formatWorkloadDescription(value: string): string {
	if (value === 'tip20') return '100% TIP-20 Transfers'
	if (value === 'mix') {
		return '70% TIP-20 Transfers, 10% MPP Channels, 10% DEX Swaps, 10% ERC-20 Transfers'
	}
	return formatWorkloadLabel(value)
}

function formatTargetTps(target: number): string {
	return target >= 1_000 ? `${target / 1_000}K` : target.toLocaleString()
}

function scenarioSortKey(scenario: ScenarioConfig): [string, number, string] {
	const match = scenario.scenarioName.match(/^(.+?)-(\d+)(k)?$/i)
	const workload = match?.[1] ?? scenario.scenarioName
	const target = match ? Number(match[2]) * (match[3] ? 1_000 : 1) : 0
	return [workload, target, scenario.scenarioName]
}

function sortScenarios(scenarios: Array<ScenarioConfig>): Array<ScenarioConfig> {
	return [...scenarios].sort((a, b) => {
		const [aWorkload, aTarget, aName] = scenarioSortKey(a)
		const [bWorkload, bTarget, bName] = scenarioSortKey(b)
		return (
			aWorkload.localeCompare(bWorkload) ||
			aTarget - bTarget ||
			aName.localeCompare(bName)
		)
	})
}

async function fetchScenarioConfigs(feed: RunFeed): Promise<Array<ScenarioConfig>> {
	const rows = await queryClickHouse<{ scenario_name: string }>(`
		SELECT DISTINCT r.scenario_name AS scenario_name
		FROM txgen_runs r
		WHERE r.scenario_name != ''
			${runFeedWhereClause(feed)}
			AND r.run_id IN (
				SELECT run_id
				FROM txgen_blocks
				WHERE block_time_ms > 0
				GROUP BY run_id
				HAVING sum(gas_used) > 0
			)
	`)
	const discovered = rows.map((row) => scenarioConfigFromName(row.scenario_name))
	return sortScenarios(discovered.length > 0 ? discovered : STATIC_SCENARIOS)
}

type RunRow = {
	run_id: string
	started_at: string
	finished_at: string
	git_sha: string
	git_ref: string
	mode: string
	scenario_name: string
	config_keys: Array<string>
	config_values: Array<string>
	avg_tps: string
	avg_block_time_ms: string
	total_gas_used: string
	run_duration_secs: string
	peak_gas_per_second: string
	block_count: string
	engine_api_latency_mean_ms: string | null
	engine_api_latency_p50_ms: string | null
	engine_api_latency_p90_ms: string | null
	engine_api_latency_p99_ms: string | null
}

function toRun(row: RunRow, scenarioId: string): BenchRun {
	const totalGas = Number(row.total_gas_used)
	const durationSecs = Number(row.run_duration_secs)
	const avgBlockTimeMs = Number(row.avg_block_time_ms)

	const config: Record<string, string> = {}
	if (row.config_keys && row.config_values) {
		for (let i = 0; i < row.config_keys.length; i++) {
			config[row.config_keys[i]] = row.config_values[i]
		}
	}

	return {
		id: row.run_id,
		scenarioId,
		commit: row.git_sha?.slice(0, 7) || '',
		ref: row.git_ref || '',
		mode: row.mode || '',
		startedAt: row.started_at,
		finishedAt: row.finished_at,
		config,
		avgTps: Number(row.avg_tps),
		avgGasPerSecond: durationSecs > 0 ? Math.round(totalGas / durationSecs) : 0,
		peakGasPerSecond: Math.round(Number(row.peak_gas_per_second)),
		avgBlockTimeMs,
		blockCount: Number(row.block_count),
		engineApiLatencyMeanMs: nullableNumber(row.engine_api_latency_mean_ms),
		engineApiLatencyP50Ms: nullableNumber(row.engine_api_latency_p50_ms),
		engineApiLatencyP90Ms: nullableNumber(row.engine_api_latency_p90_ms),
		engineApiLatencyP99Ms: nullableNumber(row.engine_api_latency_p99_ms),
	}
}

function normalizeRunFeed(feed: unknown): RunFeed {
	return feed === 'nightly' ? 'nightly' : 'release'
}

function runDayKey(run: BenchRun): string {
	return new Date(run.startedAt).toISOString().slice(0, 10)
}

function latestRunForDay(current: BenchRun, candidate: BenchRun): BenchRun {
	return new Date(candidate.startedAt).getTime() >
		new Date(current.startedAt).getTime()
		? candidate
		: current
}

function latestRunPerDay(runs: Array<BenchRun>): Array<BenchRun> {
	const byDay = new Map<string, BenchRun>()
	for (const run of runs) {
		const day = runDayKey(run)
		const existing = byDay.get(day)
		byDay.set(day, existing ? latestRunForDay(existing, run) : run)
	}
	return Array.from(byDay.values()).sort(
		(a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
	)
}

function runFeedWhereClause(feed: RunFeed): string {
	return feed === 'release'
		? "AND r.metadata['run_type'] = 'release'"
		: "AND r.metadata['run_type'] = 'nightly'"
}

function buildRunsQuery(
	scenarioName: string,
	feed: RunFeed,
	limit = 50,
): string {
	const scenario = sqlString(scenarioName)
	const candidateLimit = Math.max(50, limit * 2)

	return `
		WITH candidate_runs AS (
			SELECT
				r.run_id,
				r.started_at,
				r.finished_at,
				r.git_sha,
				r.git_ref,
				r.mode,
				r.scenario_name,
				r.config.keys AS config_keys,
				r.config.values AS config_values
			FROM txgen_runs r
			WHERE r.scenario_name = ${scenario}
				${runFeedWhereClause(feed)}
			ORDER BY r.started_at DESC
			LIMIT ${candidateLimit}
		)
		SELECT
			r.run_id AS run_id,
			r.started_at AS started_at,
			r.finished_at AS finished_at,
			r.git_sha AS git_sha,
			r.git_ref AS git_ref,
			r.mode AS mode,
			r.scenario_name AS scenario_name,
			r.config_keys AS config_keys,
			r.config_values AS config_values,
			b.avg_tps,
			b.avg_block_time_ms,
			b.total_gas_used,
			b.run_duration_secs,
			b.peak_gas_per_second,
			b.block_count,
			e.engine_api_latency_mean_ms,
			e.engine_api_latency_p50_ms,
			e.engine_api_latency_p90_ms,
			e.engine_api_latency_p99_ms
		FROM candidate_runs r
		LEFT JOIN (
			SELECT
				run_id,
				avg(tx_count * 1000.0 / block_time_ms) AS avg_tps,
				avg(block_time_ms) AS avg_block_time_ms,
				sum(gas_used) AS total_gas_used,
				sum(block_time_ms) / 1000.0 AS run_duration_secs,
				max(gas_used * 1000.0 / block_time_ms) AS peak_gas_per_second,
				count() AS block_count
			FROM txgen_blocks
			WHERE block_time_ms > 0
				AND run_id IN (SELECT run_id FROM candidate_runs)
			GROUP BY run_id
		) b ON r.run_id = b.run_id
		LEFT JOIN (
			SELECT
				q.run_id,
				m.mean_seconds * 1000 AS engine_api_latency_mean_ms,
				nullIf(q.p50_seconds, 0) * 1000 AS engine_api_latency_p50_ms,
				nullIf(q.p90_seconds, 0) * 1000 AS engine_api_latency_p90_ms,
				nullIf(q.p99_seconds, 0) * 1000 AS engine_api_latency_p99_ms
			FROM (
				SELECT
					run_id,
					avgIf(value, JSONExtractString(labels_json, 'quantile') = '0.5') AS p50_seconds,
					avgIf(value, JSONExtractString(labels_json, 'quantile') = '0.9') AS p90_seconds,
					avgIf(value, JSONExtractString(labels_json, 'quantile') = '0.99') AS p99_seconds
				FROM txgen_metric_samples
				WHERE metric_name = 'reth_consensus_engine_beacon_new_payload_latency'
					AND JSONExtractString(labels_json, 'quantile') IN ('0.5', '0.9', '0.99')
					AND value > 0
					AND run_id IN (SELECT run_id FROM candidate_runs)
				GROUP BY run_id
			) q
			LEFT JOIN (
				SELECT
					run_id,
					if(sum(count_delta) > 0, sum(sum_delta) / sum(count_delta), NULL) AS mean_seconds
				FROM (
					SELECT
						run_id,
						labels_json,
						greatest(
							0,
							maxIf(value, metric_name = 'reth_consensus_engine_beacon_new_payload_latency_sum') -
							minIf(value, metric_name = 'reth_consensus_engine_beacon_new_payload_latency_sum')
						) AS sum_delta,
						greatest(
							0,
							maxIf(value, metric_name = 'reth_consensus_engine_beacon_new_payload_latency_count') -
							minIf(value, metric_name = 'reth_consensus_engine_beacon_new_payload_latency_count')
						) AS count_delta
					FROM txgen_metric_samples
					WHERE metric_name IN (
						'reth_consensus_engine_beacon_new_payload_latency_sum',
						'reth_consensus_engine_beacon_new_payload_latency_count'
					)
						AND run_id IN (SELECT run_id FROM candidate_runs)
					GROUP BY run_id, labels_json
				)
				GROUP BY run_id
			) m ON q.run_id = m.run_id
		) e ON r.run_id = e.run_id
		WHERE b.total_gas_used > 0
		ORDER BY r.started_at DESC
		LIMIT ${limit}
	`
}

export const fetchAllLatestRuns = createServerFn({ method: 'GET' })
	.inputValidator((input: RunFeed | undefined) => normalizeRunFeed(input))
	.handler(async ({ data: feed }) => {
		const scenarios = await fetchScenarioConfigs(feed)
		const latestRuns = await Promise.all(
			scenarios.map(async (scenario) => {
				const rows = await queryClickHouse<RunRow>(
					buildRunsQuery(scenario.scenarioName, feed, 1),
				)
				const latest = rows[0]
				return latest ? toRun(latest, scenario.id) : null
			}),
		)

		return latestRuns.filter((run): run is BenchRun => run !== null)
	})

export const fetchScenarios = createServerFn({ method: 'GET' })
	.inputValidator((input: RunFeed | undefined) => normalizeRunFeed(input))
	.handler(async ({ data: feed }) =>
		(await fetchScenarioConfigs(feed)).map(scenarioFromConfig),
	)

export const fetchTrendRuns = createServerFn({ method: 'GET' })
	.inputValidator((input: RunFeed | undefined) => normalizeRunFeed(input))
	.handler(async ({ data: feed }) => {
		const scenarios = await fetchScenarioConfigs(feed)
		const histories = await Promise.all(
			scenarios.map(async (scenario) => {
				const rows = await queryClickHouse<RunRow>(
					buildRunsQuery(scenario.scenarioName, feed, 365),
				)
				const runs = latestRunPerDay(rows.map((row) => toRun(row, scenario.id)))

				return {
					scenario: {
						id: scenario.id,
						label: scenario.label,
						workload: scenario.workload,
					},
					runs,
				}
			}),
		)

		return histories satisfies Array<ScenarioRunHistory>
	})

export const fetchRunsForScenario = createServerFn({ method: 'POST' })
	.inputValidator((input: RunsForScenarioInput) => ({
		scenarioId: input.scenarioId,
		feed: normalizeRunFeed(input.feed),
	}))
	.handler(async ({ data: { scenarioId, feed } }) => {
		const config = scenarioConfigFromName(scenarioId)

		const rows = await queryClickHouse<RunRow>(
			buildRunsQuery(config.scenarioName, feed),
		)
		return rows.map((row) => toRun(row, scenarioId))
	})

export const fetchRun = createServerFn({ method: 'POST' })
	.inputValidator((input: string) => input)
	.handler(async ({ data: runId }) => {
		const run = sqlString(runId)
		const runRows = await queryClickHouse<RunRow & { scenario_name: string }>(`
			SELECT
				r.run_id AS run_id,
				r.started_at AS started_at,
				r.finished_at AS finished_at,
				r.git_sha AS git_sha,
				r.git_ref AS git_ref,
				r.mode AS mode,
				r.scenario_name AS scenario_name,
				r.config.keys AS config_keys,
				r.config.values AS config_values,
				b.avg_tps,
				b.avg_block_time_ms,
				b.total_gas_used,
				b.run_duration_secs,
				b.peak_gas_per_second,
				b.block_count
			FROM txgen_runs r
			LEFT JOIN (
				SELECT
					run_id,
					avg(tx_count * 1000.0 / block_time_ms) AS avg_tps,
					avg(block_time_ms) AS avg_block_time_ms,
					sum(gas_used) AS total_gas_used,
					sum(block_time_ms) / 1000.0 AS run_duration_secs,
					max(gas_used * 1000.0 / block_time_ms) AS peak_gas_per_second,
					count() AS block_count
				FROM txgen_blocks
				WHERE block_time_ms > 0
					AND run_id = ${run}
				GROUP BY run_id
			) b ON r.run_id = b.run_id
			WHERE r.run_id = ${run}
			LIMIT 1
		`)

		const runRow = runRows[0]
		if (!runRow) return null

		const scenarioId = scenarioConfigFromName(runRow.scenario_name).id

		return toRun(runRow, scenarioId)
	})

/** Fetch metric time-series for a run, filtered by metric names. */
export const fetchMetrics = createServerFn({ method: 'POST' })
	.inputValidator((input: { runId: string; metrics: Array<string> }) => input)
	.handler(async ({ data: { runId, metrics } }) => {
		if (metrics.length === 0) return []

		const run = sqlString(runId)
		const metricList = metrics.map(sqlString).join(', ')
		const rows = await queryClickHouse<{
			metric_name: string
			labels_json: string
			offset_ms: string
			value: string
		}>(`
			WITH
				${run} AS selected_run_id,
				(
					SELECT min(offset_ms)
					FROM txgen_metric_samples
					WHERE run_id = selected_run_id
						AND metric_name IN (${metricList})
				) AS min_offset,
				(
					SELECT max(offset_ms)
					FROM txgen_metric_samples
					WHERE run_id = selected_run_id
						AND metric_name IN (${metricList})
				) AS max_offset,
				greatest(1, toUInt64(ceil((max_offset - min_offset) / ${CHART_POINT_TARGET}.0))) AS bucket_ms
			SELECT
				metric_name,
				labels_json,
				bucket_offset_ms AS offset_ms,
				bucket_value AS value
			FROM (
				SELECT
					metric_name,
					labels_json,
					min(offset_ms) AS bucket_offset_ms,
					avg(value) AS bucket_value
				FROM txgen_metric_samples
				WHERE run_id = selected_run_id
					AND metric_name IN (${metricList})
				GROUP BY
					metric_name,
					labels_json,
					intDiv(toUInt64(offset_ms - min_offset), bucket_ms)
			)
			ORDER BY metric_name, labels_json, offset_ms
		`)

		const seriesMap = new Map<string, MetricSeries>()
		for (const row of rows) {
			const key = `${row.metric_name}::${row.labels_json}`
			let series = seriesMap.get(key)
			if (!series) {
				series = {
					name: row.metric_name,
					labels: row.labels_json,
					samples: [],
				}
				seriesMap.set(key, series)
			}
			series.samples.push({
				offsetMs: Number(row.offset_ms),
				value: Number(row.value),
			})
		}

		return Array.from(seriesMap.values())
	})

function nullableNumber(
	value: string | number | null | undefined,
): number | null {
	if (value == null || value === '') return null
	const number = Number(value)
	return Number.isFinite(number) ? number : null
}

/** Fetch block-level data for a run. */
export const fetchBlocks = createServerFn({ method: 'POST' })
	.inputValidator((input: string) => input)
	.handler(async ({ data: runId }) => {
		const run = sqlString(runId)
		const rows = await queryClickHouse<{
			block_index: string
			block_number: string
			chain_timestamp_ms: string | null
			tx_count: string
			gas_used: string
			gas_limit: string
			block_time_ms: string | null
			new_payload_ms: string | null
			forkchoice_updated_ms: string | null
			new_payload_server_latency_us: string | null
			persistence_wait_us: string | null
			execution_cache_wait_us: string | null
			sparse_trie_wait_us: string | null
		}>(`
			WITH
				${run} AS selected_run_id,
				(
					SELECT count()
					FROM txgen_blocks
					WHERE run_id = selected_run_id
				) AS total_rows,
				greatest(1, toUInt64(ceil(total_rows / ${CHART_POINT_TARGET}.0))) AS bucket_size
			SELECT
				bucket_block_index AS block_index,
				bucket_block_number AS block_number,
				bucket_chain_timestamp_ms AS chain_timestamp_ms,
				tx_count,
				gas_used,
				gas_limit,
				block_time_ms,
				new_payload_ms,
				forkchoice_updated_ms,
				new_payload_server_latency_us,
				persistence_wait_us,
				execution_cache_wait_us,
				sparse_trie_wait_us
			FROM (
				SELECT
					min(block_index) AS bucket_block_index,
					min(block_number) AS bucket_block_number,
					min(chain_timestamp_ms) AS bucket_chain_timestamp_ms,
					avg(tx_count) AS tx_count,
					avg(gas_used) AS gas_used,
					any(gas_limit) AS gas_limit,
					avg(block_time_ms) AS block_time_ms,
					avg(new_payload_ms) AS new_payload_ms,
					avg(forkchoice_updated_ms) AS forkchoice_updated_ms,
					avg(new_payload_server_latency_us) AS new_payload_server_latency_us,
					avg(persistence_wait_us) AS persistence_wait_us,
					avg(execution_cache_wait_us) AS execution_cache_wait_us,
					avg(sparse_trie_wait_us) AS sparse_trie_wait_us
				FROM txgen_blocks
				WHERE run_id = selected_run_id
				GROUP BY intDiv(toUInt64(block_index), bucket_size)
			)
			ORDER BY block_index
		`)

		return rows.map((row) => ({
			index: Number(row.block_index),
			number: Number(row.block_number),
			chainTimestampMs: nullableNumber(row.chain_timestamp_ms),
			txCount: Number(row.tx_count),
			gasUsed: Number(row.gas_used),
			gasLimit: Number(row.gas_limit),
			blockTimeMs: nullableNumber(row.block_time_ms),
			newPayloadMs: nullableNumber(row.new_payload_ms),
			forkchoiceUpdatedMs: nullableNumber(row.forkchoice_updated_ms),
			newPayloadServerLatencyUs: nullableNumber(
				row.new_payload_server_latency_us,
			),
			persistenceWaitUs: nullableNumber(row.persistence_wait_us),
			executionCacheWaitUs: nullableNumber(row.execution_cache_wait_us),
			sparseTrieWaitUs: nullableNumber(row.sparse_trie_wait_us),
		}))
	})
