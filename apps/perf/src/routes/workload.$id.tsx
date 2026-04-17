import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
	getScenario,
	fetchRunsForScenario,
	type BenchRun,
} from '#lib/server/bench'
import { formatGas, formatTps, formatMs, formatDate } from '#lib/format'

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
				{scenario.workload}
				{latest && ` · ${formatDate(latest.startedAt)}`}
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
						label="Block Time"
						value={formatMs(latest.avgBlockTimeMs)}
					/>
					<MetricCard
						label="Blocks"
						value={latest.blockCount.toLocaleString()}
					/>
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
								<th className="px-4.5 py-3 font-normal text-right">
									Block Time
								</th>
								<th className="px-4.5 py-3 font-normal text-right">Blocks</th>
								<th className="px-4.5 py-3 font-normal text-right">Date</th>
							</tr>
						</thead>
						<tbody>
							{runs.map((run: BenchRun) => (
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
										{formatMs(run.avgBlockTimeMs)}
									</td>
									<td className="px-4.5 py-3 text-right font-mono text-primary">
										{run.blockCount.toLocaleString()}
									</td>
									<td className="px-4.5 py-3 text-right text-tertiary">
										{formatDate(run.startedAt)}
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
