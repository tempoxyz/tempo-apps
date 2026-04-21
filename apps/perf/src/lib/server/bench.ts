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
	startedAt: string
	finishedAt: string
	config: Record<string, string>
	avgTps: number
	avgGasPerSecond: number
	peakGasPerSecond: number
	avgBlockTimeMs: number
	blockCount: number
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

function buildRunsQuery(scenarioName: string): string {
	return `
		SELECT
			r.run_id,
			r.started_at,
			r.finished_at,
			r.git_sha,
			r.git_ref,
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
			GROUP BY run_id
		) b ON r.run_id = b.run_id
		WHERE r.scenario_name = '${scenarioName}'
			AND b.total_gas_used > 0
		ORDER BY r.started_at DESC
		LIMIT 50
	`
}

export const fetchAllLatestRuns = createServerFn({ method: 'GET' }).handler(
	async () => {
		const results: Array<BenchRun> = []

		for (const scenario of SCENARIOS) {
			const rows = await queryClickHouse<RunRow>(
				buildRunsQuery(scenario.scenarioName),
			)
			const latest = rows[0]
			if (latest) {
				results.push(toRun(latest, scenario.id))
			}
		}

		return results
	},
)

export const fetchRunsForScenario = createServerFn({ method: 'POST' })
	.inputValidator((input: string) => input)
	.handler(async ({ data: scenarioId }) => {
		const config = SCENARIOS.find((s) => s.id === scenarioId)
		if (!config) return []

		const rows = await queryClickHouse<RunRow>(
			buildRunsQuery(config.scenarioName),
		)
		return rows.map((row) => toRun(row, scenarioId))
	})

export const fetchRun = createServerFn({ method: 'POST' })
	.inputValidator((input: string) => input)
	.handler(async ({ data: runId }) => {
		const runRows = await queryClickHouse<RunRow & { scenario_name: string }>(`
			SELECT
				r.run_id,
				r.started_at,
				r.finished_at,
				r.git_sha,
				r.git_ref,
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
				GROUP BY run_id
			) b ON r.run_id = b.run_id
			WHERE r.run_id = '${runId}'
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

		const metricList = metrics.map((m) => `'${m}'`).join(', ')
		const rows = await queryClickHouse<{
			metric_name: string
			labels_json: string
			offset_ms: string
			value: string
		}>(`
			SELECT metric_name, labels_json, offset_ms, value
			FROM txgen_metric_samples
			WHERE run_id = '${runId}'
				AND metric_name IN (${metricList})
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

/** Fetch block-level data for a run. */
export const fetchBlocks = createServerFn({ method: 'POST' })
	.inputValidator((input: string) => input)
	.handler(async ({ data: runId }) => {
		const rows = await queryClickHouse<{
			block_index: string
			block_number: string
			tx_count: string
			gas_used: string
			gas_limit: string
			block_time_ms: string
		}>(`
			SELECT block_index, block_number, tx_count, gas_used, gas_limit, block_time_ms
			FROM txgen_blocks
			WHERE run_id = '${runId}'
			ORDER BY block_index
		`)

		return rows.map((row) => ({
			index: Number(row.block_index),
			number: Number(row.block_number),
			txCount: Number(row.tx_count),
			gasUsed: Number(row.gas_used),
			gasLimit: Number(row.gas_limit),
			blockTimeMs: Number(row.block_time_ms),
		}))
	})
