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
			<div className="py-20 text-center text-secondary">
				Scenario not found.
			</div>
		)
	}

	const runs = getRunsForScenario(scenario.id)
	const latest = runs.at(-1)

	return (
		<div>
			<div className="mb-4">
				<Link
					to="/"
					className="text-[13px] text-tertiary transition-colors hover:text-primary"
				>
					← Dashboard
				</Link>
			</div>

			<section className="mb-8">
				<h2 className="text-[22px] font-bold tracking-tight text-primary">
					{scenario.label}
				</h2>
			</section>

			<p className="mb-8 text-[14px] text-secondary">
				{scenario.workload} · Target: {scenario.targetThroughput}
				{latest && ` · ${formatDate(latest.timestamp)}`}
			</p>

			{latest && (
				<section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
					<MetricCard
						label="Throughput"
						value={formatGas(latest.avgGasPerSecond)}
						accent
					/>
					<MetricCard label="Peak" value={formatGas(latest.peakGasPerSecond)} />
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
					<SectionHeader title="Block-level Gas Usage" />
					<BlockChart run={latest} />
				</section>
			)}

			<section className="mb-14">
				<SectionHeader title="Run History" />
				<div className="card">
					<table className="w-full text-[13px]">
						<thead>
							<tr className="border-b border-border bg-surface-raised text-left text-tertiary">
								<th className="px-4.5 py-3 font-normal">Commit</th>
								<th className="px-4.5 py-3 font-normal text-right">
									Throughput
								</th>
								<th className="px-4.5 py-3 font-normal text-right">TPS</th>
								<th className="px-4.5 py-3 font-normal text-right">P50</th>
								<th className="px-4.5 py-3 font-normal text-right">P99</th>
								<th className="px-4.5 py-3 font-normal text-right">Date</th>
							</tr>
						</thead>
						<tbody>
							{runs.map((run) => (
								<tr
									key={run.id}
									className="border-b border-dashed border-border last:border-0 transition-colors hover:bg-surface-hover"
								>
									<td className="px-4.5 py-3">
										<Link
											to="/run/$id"
											params={{ id: run.id }}
											className="font-mono text-[12px] text-accent hover:underline"
										>
											{run.commit}
										</Link>
									</td>
									<td className="px-4.5 py-3 text-right font-mono text-primary">
										{formatGas(run.avgGasPerSecond)}
									</td>
									<td className="px-4.5 py-3 text-right font-mono text-primary">
										{formatTps(run.avgTps)}
									</td>
									<td className="px-4.5 py-3 text-right font-mono text-primary">
										{formatMs(run.p50LatencyMs)}
									</td>
									<td className="px-4.5 py-3 text-right font-mono text-primary">
										{formatMs(run.p99LatencyMs)}
									</td>
									<td className="px-4.5 py-3 text-right text-tertiary">
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

function BlockChart(props: { run: BenchRun }): React.JSX.Element {
	const { run } = props
	const maxGas = Math.max(...run.blocks.map((b) => b.gasUsed))

	return (
		<div className="card p-5">
			<div className="flex h-44 items-end gap-[2px]">
				{run.blocks.map((block) => {
					const height = (block.gasUsed / maxGas) * 100
					return (
						<div
							key={block.number}
							className="group relative flex-1"
							style={{ height: '100%' }}
						>
							<div
								className="absolute bottom-0 w-full rounded-t-[2px] bg-accent/40 transition-all group-hover:bg-accent"
								style={{ height: `${height}%` }}
							/>
							<div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-[11px] shadow-lg group-hover:block whitespace-nowrap">
								<div className="font-medium text-primary">
									Block #{block.number}
								</div>
								<div className="mt-1 text-secondary">
									{formatGas(block.gasUsed)}
								</div>
								<div className="text-secondary">{block.txCount} txs</div>
								<div className="text-secondary">
									{formatMs(block.executionTimeMs)} exec
								</div>
							</div>
						</div>
					)
				})}
			</div>
			<div className="mt-3 flex justify-between text-[11px] text-tertiary">
				<span>Block #{run.blocks[0]?.number}</span>
				<span>Block #{run.blocks.at(-1)?.number}</span>
			</div>
		</div>
	)
}
