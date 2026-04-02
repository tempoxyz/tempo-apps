import { createFileRoute, Link } from '@tanstack/react-router'
import { getScenario, getRunsForScenario, type BenchRun } from '#data/mock'
import { formatGas, formatTps, formatMs, formatDate } from '#lib/format'

export const Route = createFileRoute('/scenario/$id')({
	component: ScenarioPage,
})

function ScenarioPage(): React.JSX.Element {
	const { id } = Route.useParams()
	const scenario = getScenario(id)

	if (!scenario) {
		return (
			<div className="py-20 text-center text-content-secondary">
				Scenario not found.
			</div>
		)
	}

	const runs = getRunsForScenario(scenario.id)
	const latest = runs.at(-1)

	return (
		<div>
			<div className="mb-2">
				<Link
					to="/"
					className="text-xs text-content-tertiary transition-colors hover:text-content-primary"
				>
					← Back to dashboard
				</Link>
			</div>

			<section className="mb-8">
				<h2 className="text-xl font-semibold text-content-primary">
					{scenario.label}
				</h2>
				<p className="mt-1 text-sm text-content-secondary">
					{scenario.workload} · Target: {scenario.targetThroughput}
				</p>
			</section>

			{latest && (
				<section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
					<MetricCard
						label="Avg Throughput"
						value={formatGas(latest.avgGasPerSecond)}
						accent
					/>
					<MetricCard
						label="Peak Throughput"
						value={formatGas(latest.peakGasPerSecond)}
					/>
					<MetricCard label="Avg TPS" value={formatTps(latest.avgTps)} />
					<MetricCard
						label="Block Time"
						value={formatMs(latest.avgBlockTimeMs)}
					/>
					<MetricCard
						label="P50 Latency"
						value={formatMs(latest.p50LatencyMs)}
					/>
					<MetricCard
						label="P99 Latency"
						value={formatMs(latest.p99LatencyMs)}
					/>
				</section>
			)}

			{latest && (
				<section className="mb-10">
					<h3 className="mb-4 text-sm font-semibold text-content-primary">
						Block-level Gas Usage
					</h3>
					<BlockChart run={latest} />
				</section>
			)}

			<section>
				<h3 className="mb-4 text-sm font-semibold text-content-primary">
					Run History
				</h3>
				<div className="overflow-hidden rounded-lg border border-border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-border bg-surface text-left text-xs text-content-secondary">
								<th className="px-4 py-3 font-medium">Commit</th>
								<th className="px-4 py-3 font-medium text-right">
									Throughput
								</th>
								<th className="px-4 py-3 font-medium text-right">TPS</th>
								<th className="px-4 py-3 font-medium text-right">P50</th>
								<th className="px-4 py-3 font-medium text-right">P99</th>
								<th className="px-4 py-3 font-medium text-right">Date</th>
							</tr>
						</thead>
						<tbody>
							{runs.map((run) => (
								<tr
									key={run.id}
									className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover"
								>
									<td className="px-4 py-3">
										<Link
											to="/run/$id"
											params={{ id: run.id }}
											className="font-mono text-xs text-accent hover:underline"
										>
											{run.commit}
										</Link>
									</td>
									<td className="px-4 py-3 text-right font-mono text-content-primary">
										{formatGas(run.avgGasPerSecond)}
									</td>
									<td className="px-4 py-3 text-right font-mono text-content-primary">
										{formatTps(run.avgTps)}
									</td>
									<td className="px-4 py-3 text-right font-mono text-content-primary">
										{formatMs(run.p50LatencyMs)}
									</td>
									<td className="px-4 py-3 text-right font-mono text-content-primary">
										{formatMs(run.p99LatencyMs)}
									</td>
									<td className="px-4 py-3 text-right text-content-tertiary">
										{formatDate(run.timestamp)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	)
}

function MetricCard(props: MetricCard.Props): React.JSX.Element {
	return (
		<div className="rounded-lg border border-border bg-surface p-4">
			<p className="text-[10px] uppercase tracking-wider text-content-tertiary">
				{props.label}
			</p>
			<p
				className={`mt-1 font-mono text-lg font-semibold ${props.accent ? 'text-accent' : 'text-content-primary'}`}
			>
				{props.value}
			</p>
		</div>
	)
}

declare namespace MetricCard {
	type Props = {
		label: string
		value: string
		accent?: boolean | undefined
	}
}

function BlockChart(props: BlockChart.Props): React.JSX.Element {
	const { run } = props
	const maxGas = Math.max(...run.blocks.map((b) => b.gasUsed))

	return (
		<div className="rounded-lg border border-border bg-surface p-4">
			<div className="flex h-40 items-end gap-px">
				{run.blocks.map((block) => {
					const height = (block.gasUsed / maxGas) * 100
					return (
						<div
							key={block.number}
							className="group relative flex-1"
							style={{ height: '100%' }}
						>
							<div
								className="absolute bottom-0 w-full rounded-t-sm bg-accent/60 transition-colors group-hover:bg-accent"
								style={{ height: `${height}%` }}
							/>
							<div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded bg-surface-raised px-2 py-1 text-[10px] text-content-primary shadow-lg group-hover:block whitespace-nowrap">
								<div>Block #{block.number}</div>
								<div>{formatGas(block.gasUsed)}</div>
								<div>{block.txCount} txs</div>
								<div>{formatMs(block.executionTimeMs)} exec</div>
							</div>
						</div>
					)
				})}
			</div>
			<div className="mt-2 flex justify-between text-[10px] text-content-tertiary">
				<span>Block #{run.blocks[0]?.number}</span>
				<span>Block #{run.blocks.at(-1)?.number}</span>
			</div>
		</div>
	)
}

declare namespace BlockChart {
	type Props = {
		run: BenchRun
	}
}
