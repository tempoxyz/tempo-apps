import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
	getScenario,
	fetchRunsForScenario,
	fetchRun,
	type BenchRun,
	type BenchBlock,
} from '#lib/server/bench'
import {
	formatGas,
	formatTps,
	formatMs,
	formatDate,
	formatAccounts,
} from '#lib/format'

export const Route = createFileRoute('/workload/$id')({
	component: ScenarioPage,
	loader: ({ params, context }) => {
		context.queryClient.ensureQueryData({
			queryKey: ['scenarioRuns', params.id],
			queryFn: () => fetchRunsForScenario({ data: params.id }),
		})
	},
})

function ScenarioPage(): React.JSX.Element {
	const { id } = Route.useParams()
	const navigate = useNavigate()
	const scenario = getScenario(id)
	const { data: runs } = useSuspenseQuery({
		queryKey: ['scenarioRuns', id],
		queryFn: () => fetchRunsForScenario({ data: id }),
	})
	const latest = runs[0]
	const { data: latestRun } = useQuery({
		queryKey: ['run', latest?.id],
		queryFn: () => (latest ? fetchRun({ data: latest.id }) : null),
		enabled: !!latest,
	})

	if (!scenario) {
		return (
			<div className="py-20 text-center text-secondary">
				Scenario not found.
			</div>
		)
	}

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
				{scenario.workload} · Target: {scenario.targetTps.toLocaleString()} TPS
				{latest && ` · ${formatDate(latest.timestamp)}`}
			</p>

			{latest && (
				<section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					<MetricCard
						label="Throughput"
						value={formatGas(latest.avgGasPerSecond)}
						accent
					/>
					<MetricCard label="Peak" value={formatGas(latest.peakGasPerSecond)} />
					<MetricCard label="Avg TPS" value={formatTps(latest.avgTps)} />
					<MetricCard
						label="State Size"
						value={`${formatAccounts(latest.stateAccounts)} accounts`}
					/>
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

			{latestRun && latestRun.blocks.length > 0 && (
				<section className="mb-10">
					<SectionHeader title="Block-level Gas Usage" />
					<BlockChart blocks={latestRun.blocks} />
				</section>
			)}

			<section className="mb-14">
				<SectionHeader title="Benchmarks" />
				<div className="card">
					<table className="w-full text-[13px]">
						<thead>
							<tr className="border-b border-border bg-surface-raised text-left text-tertiary">
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
							{runs.map((run: Omit<BenchRun, 'blocks'>) => (
								<tr
									key={run.id}
									className="border-b border-dashed border-border last:border-0 transition-colors hover:bg-surface-hover cursor-pointer"
									onClick={() =>
										navigate({
											to: '/benchmark/$id',
											params: { id: run.id },
										})
									}
								>
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

function BlockChart(props: { blocks: Array<BenchBlock> }): React.JSX.Element {
	const { blocks } = props
	const maxGas = Math.max(...blocks.map((b) => b.gasUsed))

	return (
		<div className="card p-5">
			<div className="flex gap-3">
				<div className="flex h-44 flex-col justify-between text-right text-[10px] text-tertiary font-mono">
					<span>{formatGas(maxGas, false)}</span>
					<span>{formatGas(Math.round(maxGas / 2), false)}</span>
					<span>0</span>
				</div>
				<div className="flex-1">
					<div className="flex h-44 items-end gap-[2px]">
						{blocks.map((block) => {
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
									<div className="pointer-events-none absolute top-2 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-[11px] shadow-lg group-hover:block whitespace-nowrap">
										<div className="font-medium text-primary">
											Block #{block.number}
										</div>
										<div className="mt-1 text-secondary">
											{formatGas(block.gasUsed, false)}
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
						<span>Block #{blocks[0]?.number}</span>
						<span>Block #{blocks.at(-1)?.number}</span>
					</div>
				</div>
			</div>
		</div>
	)
}
