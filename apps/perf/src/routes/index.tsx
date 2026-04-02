import { createFileRoute, Link } from '@tanstack/react-router'
import { scenarios, getLatestRun } from '#data/mock'
import { formatGas, formatTps, formatMs, formatDate } from '#lib/format'

export const Route = createFileRoute('/')({
	component: DashboardPage,
})

function DashboardPage(): React.JSX.Element {
	return (
		<div>
			<section className="mb-10">
				<h2 className="text-lg font-semibold text-content-primary">
					Scenario Overview
				</h2>
				<p className="mt-1 text-sm text-content-secondary">
					Curated benchmarks showing Tempo&apos;s performance under different
					workloads and validator configurations.
				</p>
			</section>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{scenarios.map((scenario) => {
					const latest = getLatestRun(scenario.id)
					return (
						<Link
							key={scenario.id}
							to="/scenario/$id"
							params={{ id: scenario.id }}
							className="group rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent/30 hover:bg-surface-hover"
						>
							<div className="mb-4 flex items-center justify-between">
								<span className="text-xs font-medium text-accent">
									{scenario.validators} validators
								</span>
								{latest && (
									<span className="text-xs text-content-tertiary">
										{formatDate(latest.timestamp)}
									</span>
								)}
							</div>

							<h3 className="mb-1 text-sm font-semibold text-content-primary">
								{scenario.label}
							</h3>
							<p className="mb-4 text-xs text-content-tertiary">
								{scenario.workload}
							</p>

							{latest ? (
								<div className="grid grid-cols-2 gap-3">
									<Stat
										label="Throughput"
										value={formatGas(latest.avgGasPerSecond)}
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
							) : (
								<p className="text-xs text-content-tertiary italic">
									No runs yet
								</p>
							)}
						</Link>
					)
				})}
			</div>

			<section className="mt-12">
				<h2 className="mb-4 text-lg font-semibold text-content-primary">
					Latest Runs
				</h2>
				<div className="overflow-hidden rounded-lg border border-border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-border bg-surface text-left text-xs text-content-secondary">
								<th className="px-4 py-3 font-medium">Scenario</th>
								<th className="px-4 py-3 font-medium">Commit</th>
								<th className="px-4 py-3 font-medium text-right">
									Throughput
								</th>
								<th className="px-4 py-3 font-medium text-right">TPS</th>
								<th className="px-4 py-3 font-medium text-right">
									P99 Latency
								</th>
								<th className="px-4 py-3 font-medium text-right">Date</th>
							</tr>
						</thead>
						<tbody>
							{scenarios.map((scenario) => {
								const latest = getLatestRun(scenario.id)
								if (!latest) return null
								return (
									<tr
										key={latest.id}
										className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover"
									>
										<td className="px-4 py-3">
											<Link
												to="/scenario/$id"
												params={{ id: scenario.id }}
												className="text-content-primary hover:text-accent transition-colors"
											>
												{scenario.label}
											</Link>
										</td>
										<td className="px-4 py-3">
											<code className="font-mono text-xs text-content-secondary">
												{latest.commit}
											</code>
										</td>
										<td className="px-4 py-3 text-right font-mono text-accent">
											{formatGas(latest.avgGasPerSecond)}
										</td>
										<td className="px-4 py-3 text-right font-mono text-content-primary">
											{formatTps(latest.avgTps)}
										</td>
										<td className="px-4 py-3 text-right font-mono text-content-primary">
											{formatMs(latest.p99LatencyMs)}
										</td>
										<td className="px-4 py-3 text-right text-content-tertiary">
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

function Stat(props: Stat.Props): React.JSX.Element {
	return (
		<div>
			<p className="text-[10px] uppercase tracking-wider text-content-tertiary">
				{props.label}
			</p>
			<p className="mt-0.5 font-mono text-sm font-medium text-content-primary">
				{props.value}
			</p>
		</div>
	)
}

declare namespace Stat {
	type Props = {
		label: string
		value: string
	}
}
