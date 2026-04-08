import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getScenarios, fetchAllLatestRuns } from '#lib/server/bench'
import {
	formatGas,
	formatTps,
	formatMs,
	formatDate,
	formatAccounts,
} from '#lib/format'

export const Route = createFileRoute('/')({
	component: DashboardPage,
	loader: ({ context }) => {
		context.queryClient.ensureQueryData({
			queryKey: ['latestRuns'],
			queryFn: () => fetchAllLatestRuns(),
		})
	},
})

function DashboardPage(): React.JSX.Element {
	const navigate = useNavigate()
	const scenarios = getScenarios()
	const { data: latestRuns } = useSuspenseQuery({
		queryKey: ['latestRuns'],
		queryFn: () => fetchAllLatestRuns(),
	})

	function getLatestRun(scenarioId: string) {
		return latestRuns.find((r) => r.scenarioId === scenarioId)
	}

	return (
		<div>
			{/* Hero */}
			<section className="mb-12 pt-4">
				<h2 className="text-[28px] font-bold tracking-tight text-primary">
					Performance Dashboard
				</h2>
				<p className="mt-2 max-w-xl text-[15px] leading-relaxed text-secondary">
					Real-time benchmarks measuring Tempo&apos;s throughput and latency
					under production-representative workloads.
				</p>
			</section>

			{/* Scenario cards */}
			<section className="mb-14">
				<div className="mb-5 flex items-center gap-3">
					<h3 className="text-[13px] font-normal uppercase tracking-wider text-tertiary">
						Workloads
					</h3>
					<div className="h-px flex-1 bg-border" />
				</div>

				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{scenarios.map((scenario) => {
						const latest = getLatestRun(scenario.id)
						return (
							<Link
								key={scenario.id}
								to="/workload/$id"
								params={{ id: scenario.id }}
								className="card-interactive flex flex-col"
							>
								<div className="p-5 pb-4">
									<h4 className="text-[15px] font-semibold text-primary">
										{scenario.label}
									</h4>
									<p className="mt-1 text-[12px] text-tertiary">
										{scenario.workload}
									</p>
								</div>

								{latest ? (
									<div className="mt-auto border-t border-border px-5 pt-4 pb-5">
										<div className="grid grid-cols-2 gap-x-4 gap-y-3">
											<Stat
												label="Throughput"
												value={formatGas(latest.avgGasPerSecond)}
												highlight
											/>
											<Stat
												label="Peak"
												value={formatGas(latest.peakGasPerSecond)}
											/>
											<Stat label="Avg TPS" value={formatTps(latest.avgTps)} />
											<Stat
												label="P99 Latency"
												value={formatMs(latest.p99LatencyMs)}
											/>
										</div>
									</div>
								) : (
									<div className="mt-auto border-t border-border px-5 py-4">
										<p className="text-[12px] text-tertiary italic">
											No runs yet
										</p>
									</div>
								)}
							</Link>
						)
					})}
				</div>
			</section>

			{/* Throughput comparison */}
			<section className="mb-14">
				<div className="mb-5 flex items-center gap-3">
					<h3 className="text-[13px] font-normal uppercase tracking-wider text-tertiary">
						Throughput Comparison
					</h3>
					<div className="h-px flex-1 bg-border" />
				</div>
				<div className="card p-6">
					<div className="flex items-end gap-6 h-52">
						{scenarios.map((scenario) => {
							const latest = getLatestRun(scenario.id)
							if (!latest) return null
							const maxGas = Math.max(
								...scenarios.map(
									(s) => getLatestRun(s.id)?.avgGasPerSecond ?? 0,
								),
							)
							const height = (latest.avgGasPerSecond / maxGas) * 100
							return (
								<div
									key={scenario.id}
									className="flex flex-1 flex-col items-center gap-2"
								>
									<span className="font-mono text-[12px] font-medium text-accent">
										{formatGas(latest.avgGasPerSecond)}
									</span>
									<div
										className="w-full flex items-end"
										style={{ height: '160px' }}
									>
										<div
											className="w-full rounded-t bg-accent/50"
											style={{ height: `${height}%` }}
										/>
									</div>
									<span className="text-[11px] text-tertiary text-center leading-tight">
										{scenario.label}
									</span>
								</div>
							)
						})}
					</div>
				</div>
			</section>

			{/* Latest runs table */}
			<section className="mb-14">
				<div className="mb-5 flex items-center gap-3">
					<h3 className="text-[13px] font-normal uppercase tracking-wider text-tertiary">
						Latest Results
					</h3>
					<div className="h-px flex-1 bg-border" />
				</div>

				<div className="card">
					<table className="w-full text-[13px]">
						<thead>
							<tr className="border-b border-border bg-surface-raised text-left text-tertiary">
								<th className="px-4.5 py-3 font-normal">Workload</th>
								<th className="px-4.5 py-3 font-normal text-right">
									Throughput
								</th>
								<th className="px-4.5 py-3 font-normal text-right">TPS</th>
								<th className="px-4.5 py-3 font-normal text-right">
									P99 Latency
								</th>
								<th className="px-4.5 py-3 font-normal text-right">
									State Size
								</th>
								<th className="px-4.5 py-3 font-normal text-right">Date</th>
							</tr>
						</thead>
						<tbody>
							{scenarios.map((scenario) => {
								const latest = getLatestRun(scenario.id)
								if (!latest) return null
								return (
									<tr
										key={latest.id}
										className="border-b border-dashed border-border last:border-0 transition-colors hover:bg-surface-hover cursor-pointer"
										onClick={() =>
											navigate({
												to: '/workload/$id',
												params: { id: scenario.id },
											})
										}
									>
										<td className="px-4.5 py-3 font-medium text-primary">
											{scenario.label}
										</td>
										<td className="px-4.5 py-3 text-right font-mono text-accent">
											{formatGas(latest.avgGasPerSecond)}
										</td>
										<td className="px-4.5 py-3 text-right font-mono text-primary">
											{formatTps(latest.avgTps)}
										</td>
										<td className="px-4.5 py-3 text-right font-mono text-primary">
											{formatMs(latest.p99LatencyMs)}
										</td>
										<td className="px-4.5 py-3 text-right font-mono text-primary">
											{formatAccounts(latest.stateAccounts)}
										</td>
										<td className="px-4.5 py-3 text-right text-tertiary">
											{formatDate(latest.timestamp)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	)
}

function Stat(props: {
	label: string
	value: string
	highlight?: boolean | undefined
}): React.JSX.Element {
	return (
		<div>
			<p className="text-[11px] font-normal uppercase tracking-wider text-tertiary">
				{props.label}
			</p>
			<p
				className={`mt-0.5 font-mono text-[14px] font-medium ${props.highlight ? 'text-accent' : 'text-primary'}`}
			>
				{props.value}
			</p>
		</div>
	)
}
