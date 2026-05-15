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

const SCENARIOS: Array<{
	id: string
	label: string
	workload: string
	scenarioName: string
}> = [
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
		id: 'tip20-40k',
		label: 'TIP-20 — 40K TPS',
		workload: '100% TIP-20 Transfers',
		scenarioName: 'tip20-40k',
	},
	{
		id: 'mix-10k',
		label: 'Mix — 10K TPS',
		workload: '80% TIP-20 Transfers, 20% MPP Channels',
		scenarioName: 'mix-10k',
	},
	{
		id: 'mix-20k',
		label: 'Mix — 20K TPS',
		workload: '80% TIP-20 Transfers, 20% MPP Channels',
		scenarioName: 'mix-20k',
	},
	{
		id: 'mix-40k',
		label: 'Mix — 40K TPS',
		workload: '80% TIP-20 Transfers, 20% MPP Channels',
		scenarioName: 'mix-40k',
	},
]

// Target maximum number of points returned per chart series. Large runs can
// contain enough raw block/metric samples to exceed Cloudflare Worker memory
// limits when serialized as JSON, so fetch queries aggregate samples into this
// many buckets before returning them to the app.
const CHART_POINT_TARGET = 300

// Maximum total rows returned from metric sample queries.  With many label
// combinations (quantile buckets, node labels, etc.) the cartesian product of
// series × points can blow past the Worker memory limit even after time-
// bucketing.  This hard cap keeps the response well within the 128 MB ceiling.
const MAX_METRIC_ROWS = 15_000

function sqlString(value: string): string {
	return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

export function getScenarios(): Array<Scenario> {
	return SCENARIOS.map(({ scenarioName: _, ...s }) => s)
}

export function getScenario(id: string): Scenario | undefined {
	return SCENARIOS.find((s) => s.id === id)
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
	}
}

function normalizeRunFeed(feed: unknown): RunFeed {
	return feed === 'nightly' ? 'nightly' : 'release'
}

function runFeedWhereClause(feed: RunFeed): string {
	return feed === 'release'
		? "AND startsWith(r.git_ref, 'v')"
		: "AND NOT startsWith(r.git_ref, 'v')"
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
			r.run_id,
			r.started_at,
			r.finished_at,
			r.git_sha,
			r.git_ref,
			r.mode,
			r.scenario_name,
			r.config_keys,
			r.config_values,
			b.avg_tps,
			b.avg_block_time_ms,
			b.total_gas_used,
			b.run_duration_secs,
			b.peak_gas_per_second,
			b.block_count
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
		WHERE b.total_gas_used > 0
		ORDER BY r.started_at DESC
		LIMIT ${limit}
	`
}

export const fetchAllLatestRuns = createServerFn({ method: 'GET' })
	.inputValidator((input: RunFeed | undefined) => normalizeRunFeed(input))
	.handler(async ({ data: feed }) => {
		const latestRuns = await Promise.all(
			SCENARIOS.map(async (scenario) => {
				const rows = await queryClickHouse<RunRow>(
					buildRunsQuery(scenario.scenarioName, feed, 1),
				)
				const latest = rows[0]
				return latest ? toRun(latest, scenario.id) : null
			}),
		)

		return latestRuns.filter((run): run is BenchRun => run !== null)
	})

export const fetchRunsForScenario = createServerFn({ method: 'POST' })
	.inputValidator((input: RunsForScenarioInput) => ({
		scenarioId: input.scenarioId,
		feed: normalizeRunFeed(input.feed),
	}))
	.handler(async ({ data: { scenarioId, feed } }) => {
		const config = SCENARIOS.find((s) => s.id === scenarioId)
		if (!config) return []

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
				r.run_id,
				r.started_at,
				r.finished_at,
				r.git_sha,
				r.git_ref,
				r.mode,
				r.scenario_name,
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

		const scenarioId =
			SCENARIOS.find((s) => s.scenarioName === runRow.scenario_name)?.id ?? ''

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
			LIMIT ${MAX_METRIC_ROWS}
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
