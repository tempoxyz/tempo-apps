import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
	getScenario,
	fetchRunsForScenario,
	type BenchRun,
} from '#lib/server/bench'
import { formatGas, formatTps, formatMs, formatDate } from '#lib/format'

const TEMPO_REPO = 'https://github.com/tempoxyz/tempo'

function isTag(ref: string): boolean {
	return /^v\d/.test(ref)
}

function VersionLink(props: { run: BenchRun }): React.JSX.Element {
	const { run } = props
	if (run.ref && isTag(run.ref)) {
		return (
			<a
				href={`${TEMPO_REPO}/releases/tag/${run.ref}`}
				target="_blank"
				rel="noopener noreferrer"
				className="hover:underline"
				onClick={(e) => e.stopPropagation()}
			>
				{run.ref}
			</a>
		)
	}
	return (
		<a
			href={`${TEMPO_REPO}/commit/${run.commit}`}
			target="_blank"
			rel="noopener noreferrer"
			className="hover:underline"
			onClick={(e) => e.stopPropagation()}
		>
			{run.ref ? `${run.ref} (${run.commit})` : run.commit}
		</a>
	)
}

const NOISE_THRESHOLD = 0.02

function Delta(props: {
	current: number
	previous: number
	lowerIsBetter?: boolean | undefined
}): React.JSX.Element | null {
	if (props.previous === 0) return null
	const ratio = (props.current - props.previous) / props.previous
	if (Math.abs(ratio) < NOISE_THRESHOLD)
		return <span className="ml-1.5 text-[11px] text-tertiary">=</span>
	const up = ratio > 0
	const improved = props.lowerIsBetter ? !up : up
	return (
		<span
			className={`ml-1.5 text-[11px] ${improved ? 'text-positive' : 'text-negative'}`}
		>
			{up ? '▲' : '▼'} {(Math.abs(ratio) * 100).toFixed(1)}%
		</span>
	)
}

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
	const prev = runs[1]

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
						tooltip="Average gas per second across the entire run. Calculated as total gas used ÷ total run duration."
						delta={
							prev && (
								<Delta
									current={latest.avgGasPerSecond}
									previous={prev.avgGasPerSecond}
								/>
							)
						}
						accent
					/>
					<MetricCard
						label="Peak"
						value={formatGas(latest.peakGasPerSecond)}
						tooltip="Highest gas per second achieved by any single block, based on its gas usage and block time."
						delta={
							prev && (
								<Delta
									current={latest.peakGasPerSecond}
									previous={prev.peakGasPerSecond}
								/>
							)
						}
					/>
					<MetricCard
						label="Avg TPS"
						value={formatTps(latest.avgTps)}
						tooltip="Average transactions per second across all blocks, based on transaction count and block time."
						delta={
							prev && <Delta current={latest.avgTps} previous={prev.avgTps} />
						}
					/>
					<MetricCard
						label="Block Time"
						value={formatMs(latest.avgBlockTimeMs)}
						tooltip="Average wall-clock time between consecutive blocks."
						delta={
							prev && (
								<Delta
									current={latest.avgBlockTimeMs}
									previous={prev.avgBlockTimeMs}
									lowerIsBetter
								/>
							)
						}
					/>
				</section>
			)}

			<section className="mb-14">
				<SectionHeader title="Benchmarks" />
				<div className="card">
					<table className="w-full text-[13px]">
						<thead>
							<tr className="border-b border-border bg-surface-raised text-left text-tertiary">
								<th className="px-4.5 py-3 font-normal">Version</th>
								<th className="px-4.5 py-3 font-normal text-right">
									Throughput
								</th>
								<th className="px-4.5 py-3 font-normal text-right">TPS</th>
								<th className="px-4.5 py-3 font-normal text-right">
									Block Time
								</th>
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
									<td className="px-4.5 py-3 font-mono text-accent">
										<VersionLink run={run} />
									</td>
									<td className="px-4.5 py-3 text-right font-mono text-primary">
										{formatGas(run.avgGasPerSecond)}
									</td>
									<td className="px-4.5 py-3 text-right font-mono text-primary">
										{formatTps(run.avgTps)}
									</td>
									<td className="px-4.5 py-3 text-right font-mono text-primary">
										{formatMs(run.avgBlockTimeMs)}
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

function InfoPill(props: { text: string }): React.JSX.Element {
	return (
		<span className="group relative ml-1 inline-flex">
			<span className="inline-flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full bg-border text-[9px] font-medium text-tertiary">
				?
			</span>
			<span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-max max-w-60 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-[11px] font-normal normal-case tracking-normal text-secondary shadow-lg group-hover:block">
				{props.text}
			</span>
		</span>
	)
}

function SectionHeader(props: {
	title: string
	tooltip?: string | undefined
}): React.JSX.Element {
	return (
		<div className="mb-4 flex items-center gap-3">
			<h3 className="text-[13px] font-normal uppercase tracking-wider text-tertiary">
				{props.title}
				{props.tooltip && <InfoPill text={props.tooltip} />}
			</h3>
			<div className="h-px flex-1 bg-border" />
		</div>
	)
}

function MetricCard(props: {
	label: string
	value: string
	accent?: boolean | undefined
	tooltip?: string | undefined
	delta?: React.ReactNode | undefined
}): React.JSX.Element {
	return (
		<div className="card overflow-visible p-4">
			<p className="text-[11px] font-normal uppercase tracking-wider text-tertiary">
				{props.label}
				{props.tooltip && <InfoPill text={props.tooltip} />}
			</p>
			<p
				className={`mt-1 font-mono text-[18px] font-semibold ${props.accent ? 'text-accent' : 'text-primary'}`}
			>
				{props.value}
				{props.delta}
			</p>
		</div>
	)
}
