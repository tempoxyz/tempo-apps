import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	fetchAllLatestRuns,
	getScenarios,
	type BenchRun,
	type RunFeed,
} from '#lib/server/bench'
import { cx } from '#lib/css'
import { formatGas, formatMs, formatTps } from '#lib/format'

export function BenchmarkDashboard(
	props: BenchmarkDashboard.Props,
): React.JSX.Element {
	const scenarios = getScenarios()
	const { data: latestRuns } = useSuspenseQuery({
		queryKey: ['latestRuns', props.feed],
		queryFn: () => fetchAllLatestRuns({ data: props.feed }),
	})

	function getLatestRun(scenarioId: string) {
		return latestRuns.find((r) => r.scenarioId === scenarioId)
	}

	const runsWithData = latestRuns.filter((r) => r.avgTps > 0)
	const peakTpsRun =
		runsWithData.length > 0
			? runsWithData.reduce((best, r) => (r.avgTps > best.avgTps ? r : best))
			: null

	const tip20Scenarios = scenarios.filter((s) => s.id.startsWith('tip20-'))
	const mixScenarios = scenarios.filter((s) => s.id.startsWith('mix-'))
	const isNightly = props.feed === 'nightly'

	return (
		<div>
			<p className="pt-4 pb-8 max-w-xl text-[14px] leading-relaxed text-secondary">
				{isNightly
					? 'Internal nightly benchmarks measuring Tempo throughput and latency under production-representative workloads.'
					: 'Real-time benchmarks measuring Tempo throughput and latency under production-representative workloads.'}
			</p>
			{isNightly && (
				<div className="mb-8 rounded-lg border border-accent/30 bg-accent/8 px-4 py-3">
					<p className="text-[12px] font-medium uppercase tracking-wider text-accent">
						Nightly benchmark view
					</p>
					<p className="mt-1 text-[13px] text-secondary">
						Internal non-release runs. Results may include untagged commits and
						should not be treated as release performance.
					</p>
				</div>
			)}

			{/* Hero — peak TPS headline */}
			<section className="mb-14">
				<p className="text-[13px] font-medium uppercase tracking-wider text-tertiary">
					Peak TPS
				</p>
				{peakTpsRun ? (
					<>
						<h2 className="mt-2 font-mono text-[56px] font-bold leading-none tracking-tight text-accent">
							{formatTps(peakTpsRun.avgTps)}{' '}
							<span className="text-[28px] font-semibold text-tertiary">
								TPS
							</span>
						</h2>
						<div className="mt-5 flex flex-wrap items-center gap-6">
							<HeroStat
								label="Throughput"
								value={formatGas(peakTpsRun.peakGasPerSecond)}
							/>
							<HeroStat
								label="Block Time"
								value={formatMs(peakTpsRun.avgBlockTimeMs)}
							/>
							<HeroStat
								label="Workload"
								value={
									scenarios.find((s) => s.id === peakTpsRun.scenarioId)
										?.label ?? peakTpsRun.scenarioId
								}
							/>
						</div>
					</>
				) : (
					<h2 className="mt-2 font-mono text-[56px] font-bold leading-none tracking-tight text-tertiary">
						—
					</h2>
				)}
			</section>

			{/* Throughput comparison — visual bar chart */}
			{runsWithData.length > 0 && (
				<section className="mb-14">
					<SectionHeader title="TPS Comparison" />
					<div className="card p-6">
						<div className="flex items-end gap-4 h-52">
							{scenarios.map((scenario) => {
								const latest = getLatestRun(scenario.id)
								if (!latest) return null
								const maxTps = Math.max(
									...scenarios.map((s) => getLatestRun(s.id)?.avgTps ?? 0),
								)
								const height = (latest.avgTps / maxTps) * 100
								const isMix = scenario.id.startsWith('mix-')
								return (
									<Link
										key={scenario.id}
										to="/benchmark/$id"
										params={{ id: latest.id }}
										className="flex flex-1 flex-col items-center gap-2 group"
									>
										<span className="font-mono text-[12px] font-medium text-accent">
											{formatTps(latest.avgTps)}
										</span>
										<div
											className="w-full flex items-end"
											style={{ height: '160px' }}
										>
											<div
												className={cx(
													'w-full rounded-t transition-opacity group-hover:opacity-80',
													isMix ? 'bg-positive/50' : 'bg-accent/50',
												)}
												style={{ height: `${height}%` }}
											/>
										</div>
										<span className="text-[11px] text-tertiary text-center leading-tight">
											{scenario.label}
										</span>
									</Link>
								)
							})}
						</div>
						<div className="mt-4 flex items-center justify-center gap-6">
							<div className="flex items-center gap-1.5">
								<span className="inline-block h-2.5 w-2.5 rounded-full bg-accent/50" />
								<span className="text-[11px] text-tertiary">
									TIP-20 Transfers
								</span>
							</div>
							<div className="flex items-center gap-1.5">
								<span className="inline-block h-2.5 w-2.5 rounded-full bg-positive/50" />
								<span className="text-[11px] text-tertiary">Mixed Workload</span>
							</div>
						</div>
					</div>
				</section>
			)}

			{/* TIP-20 workloads */}
			<section className="mb-14">
				<SectionHeader
					title="TIP-20 Transfers"
					subtitle="100% TIP-20 token transfers"
				/>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{tip20Scenarios.map((scenario) => (
						<ScenarioCard
							key={scenario.id}
							scenario={scenario}
							run={getLatestRun(scenario.id)}
						/>
					))}
				</div>
			</section>

			{/* Mix workloads */}
			<section className="mb-14">
				<SectionHeader
					title="Mixed Workloads"
					subtitle="70% TIP-20, 10% ERC-20, 10% MPP, 10% DEX"
				/>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{mixScenarios.map((scenario) => (
						<ScenarioCard
							key={scenario.id}
							scenario={scenario}
							run={getLatestRun(scenario.id)}
						/>
					))}
				</div>
			</section>
		</div>
	)
}

export declare namespace BenchmarkDashboard {
	type Props = {
		feed: RunFeed
	}
}

function SectionHeader(props: {
	title: string
	subtitle?: string
}): React.JSX.Element {
	return (
		<div className="mb-5 flex items-center gap-3">
			<div className="flex items-baseline gap-2">
				<h3 className="text-[13px] font-normal uppercase tracking-wider text-tertiary">
					{props.title}
				</h3>
				{props.subtitle && (
					<span className="text-[11px] text-tertiary/60">{props.subtitle}</span>
				)}
			</div>
			<div className="h-px flex-1 bg-border" />
		</div>
	)
}

function ScenarioCard(props: {
	scenario: { id: string; label: string; workload: string }
	run: BenchRun | undefined
}): React.JSX.Element {
	const { scenario, run } = props
	const content = (
		<>
			<div className="p-5 pb-4">
				<h4 className="text-[15px] font-semibold text-primary">
					{scenario.label}
				</h4>
				<p className="mt-1 text-[12px] text-tertiary">{scenario.workload}</p>
			</div>

			{run ? (
				<div className="mt-auto border-t border-border px-5 pt-4 pb-5">
					<div className="grid grid-cols-2 gap-x-4 gap-y-3">
						<Stat label="TPS" value={formatTps(run.avgTps)} highlight />
						<Stat label="Block Time" value={formatMs(run.avgBlockTimeMs)} />
						<Stat label="Throughput" value={formatGas(run.avgGasPerSecond)} />
						<Stat label="Peak" value={formatGas(run.peakGasPerSecond)} />
					</div>
				</div>
			) : (
				<div className="mt-auto border-t border-border px-5 py-4">
					<p className="text-[12px] text-tertiary italic">No runs yet</p>
				</div>
			)}
		</>
	)

	return run ? (
		<Link
			to="/benchmark/$id"
			params={{ id: run.id }}
			className="card-interactive flex flex-col"
		>
			{content}
		</Link>
	) : (
		<div className="card flex flex-col">{content}</div>
	)
}

function HeroStat(props: { label: string; value: string }): React.JSX.Element {
	return (
		<div className="flex items-baseline gap-2">
			<span className="text-[12px] uppercase tracking-wider text-tertiary">
				{props.label}
			</span>
			<span className="font-mono text-[18px] font-semibold text-primary">
				{props.value}
			</span>
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
				className={cx(
					'mt-0.5 font-mono text-[14px] font-medium',
					props.highlight ? 'text-accent' : 'text-primary',
				)}
			>
				{props.value}
			</p>
		</div>
	)
}
