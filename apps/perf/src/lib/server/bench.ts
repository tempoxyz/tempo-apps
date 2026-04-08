import { createServerFn } from '@tanstack/react-start'
import { queryClickHouse } from '#lib/server/clickhouse'

export type Scenario = {
	id: string
	label: string
	workload: string
	targetTps: number
	accounts: number
}

export type BenchRun = {
	id: string
	scenarioId: string
	commit: string
	timestamp: string
	avgTps: number
	avgGasPerSecond: number
	peakGasPerSecond: number
	avgBlockTimeMs: number
	p50LatencyMs: number
	p99LatencyMs: number
	stateAccounts: number
	blocks: Array<BenchBlock>
}

export type BenchBlock = {
	number: number
	gasUsed: number
	txCount: number
	executionTimeMs: number
	timestamp: number
}

type ScenarioConfig = Scenario & {
	filter: {
		target_tps: number
		accounts: number
		benchmark_mode: string
	}
}

const SCENARIOS: Array<ScenarioConfig> = [
	{
		id: 'tip20-10k',
		label: 'TIP-20 — 10K TPS',
		workload: '100% TIP-20 Transfers',
		targetTps: 10000,
		accounts: 1000,
		filter: { target_tps: 10000, accounts: 1000, benchmark_mode: '' },
	},
	{
		id: 'tip20-20k',
		label: 'TIP-20 — 20K TPS',
		workload: '100% TIP-20 Transfers',
		targetTps: 20000,
		accounts: 1000,
		filter: { target_tps: 20000, accounts: 1000, benchmark_mode: '' },
	},
	{
		id: 'tip20-40k',
		label: 'TIP-20 — 40K TPS',
		workload: '100% TIP-20 Transfers',
		targetTps: 40000,
		accounts: 1000,
		filter: { target_tps: 40000, accounts: 1000, benchmark_mode: '' },
	},
]

export function getScenarios(): Array<Scenario> {
	return SCENARIOS.map(({ filter: _, ...scenario }) => scenario)
}

export function getScenario(id: string): Scenario | undefined {
	return SCENARIOS.find((s) => s.id === id)
}

function getScenarioConfig(id: string): ScenarioConfig | undefined {
	return SCENARIOS.find((s) => s.id === id)
}

type RunRow = {
	run_id: string
	created_at: string
	node_commit_sha: string
	avg_tps: string
	avg_block_time_ms: string
	accounts: string
	total_gas_used: string
	run_duration_secs: string
	peak_gas_used: string
	p50_latency_ms: string
	p99_latency_ms: string
}

function toRun(row: RunRow, scenarioId: string): Omit<BenchRun, 'blocks'> {
	const totalGas = Number(row.total_gas_used)
	const durationSecs = Number(row.run_duration_secs)
	const avgBlockTimeMs = Number(row.avg_block_time_ms)
	const peakGasUsed = Number(row.peak_gas_used)

	return {
		id: row.run_id,
		scenarioId,
		commit: row.node_commit_sha?.slice(0, 7) || '',
		timestamp: row.created_at,
		avgTps: Number(row.avg_tps),
		avgGasPerSecond: durationSecs > 0 ? Math.round(totalGas / durationSecs) : 0,
		peakGasPerSecond:
			avgBlockTimeMs > 0
				? Math.round((peakGasUsed * 1000) / avgBlockTimeMs)
				: 0,
		avgBlockTimeMs,
		p50LatencyMs: Number(row.p50_latency_ms),
		p99LatencyMs: Number(row.p99_latency_ms),
		stateAccounts: Number(row.accounts),
	}
}

type BlockRow = {
	block_number: string
	timestamp_ms: string
	tx_count: string
	gas_used: string
	latency_ms: string
}

function toBlock(row: BlockRow): BenchBlock {
	return {
		number: Number(row.block_number),
		gasUsed: Number(row.gas_used),
		txCount: Number(row.tx_count),
		executionTimeMs: Number(row.latency_ms),
		timestamp: Number(row.timestamp_ms),
	}
}

function buildRunsQuery(filter: ScenarioConfig['filter']): string {
	return `
		SELECT
			r.run_id,
			r.created_at,
			r.node_commit_sha,
			r.avg_tps,
			r.avg_block_time_ms,
			r.accounts,
			r.total_gas_used,
			r.run_duration_secs,
			b.peak_gas_used,
			b.p50_latency_ms,
			b.p99_latency_ms
		FROM tempo_bench_runs r
		LEFT JOIN (
			SELECT
				run_id,
				max(gas_used) AS peak_gas_used,
				quantile(0.5)(latency_ms) AS p50_latency_ms,
				quantile(0.99)(latency_ms) AS p99_latency_ms
			FROM tempo_bench_blocks
			GROUP BY run_id
		) b ON r.run_id = b.run_id
		WHERE r.target_tps = ${filter.target_tps}
			AND r.accounts = ${filter.accounts}
			AND r.benchmark_mode = '${filter.benchmark_mode}'
			AND r.total_gas_used > 0
			AND r.run_duration_secs > 0
		ORDER BY r.created_at DESC
		LIMIT 50
	`
}

export const fetchAllLatestRuns = createServerFn({ method: 'GET' }).handler(
	async () => {
		const results: Array<Omit<BenchRun, 'blocks'>> = []

		for (const scenario of SCENARIOS) {
			const rows = await queryClickHouse<RunRow>(
				buildRunsQuery(scenario.filter),
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
		const config = getScenarioConfig(scenarioId)
		if (!config) return []

		const rows = await queryClickHouse<RunRow>(buildRunsQuery(config.filter))
		return rows.map((row) => toRun(row, scenarioId))
	})

export const fetchRun = createServerFn({ method: 'POST' })
	.inputValidator((input: string) => input)
	.handler(async ({ data: runId }) => {
		const runRows = await queryClickHouse<
			RunRow & { target_tps: string; benchmark_mode: string }
		>(`
			SELECT
				r.run_id,
				r.created_at,
				r.node_commit_sha,
				r.avg_tps,
				r.avg_block_time_ms,
				r.accounts,
				r.total_gas_used,
				r.run_duration_secs,
				r.target_tps,
				r.benchmark_mode,
				b.peak_gas_used,
				b.p50_latency_ms,
				b.p99_latency_ms
			FROM tempo_bench_runs r
			LEFT JOIN (
				SELECT
					run_id,
					max(gas_used) AS peak_gas_used,
					quantile(0.5)(latency_ms) AS p50_latency_ms,
					quantile(0.99)(latency_ms) AS p99_latency_ms
				FROM tempo_bench_blocks
				GROUP BY run_id
			) b ON r.run_id = b.run_id
			WHERE r.run_id = '${runId}'
			LIMIT 1
		`)

		const runRow = runRows[0]
		if (!runRow) return null

		const scenarioId =
			SCENARIOS.find(
				(s) =>
					s.filter.target_tps === Number(runRow.target_tps) &&
					s.filter.benchmark_mode === runRow.benchmark_mode,
			)?.id ?? ''

		const blockRows = await queryClickHouse<BlockRow>(`
			SELECT block_number, timestamp_ms, tx_count, gas_used, latency_ms
			FROM tempo_bench_blocks
			WHERE run_id = '${runId}'
			ORDER BY block_number
		`)

		return {
			...toRun(runRow, scenarioId),
			blocks: blockRows.map(toBlock),
		} satisfies BenchRun
	})
