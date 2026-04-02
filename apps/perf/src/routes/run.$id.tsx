import { createFileRoute, Link } from '@tanstack/react-router'
import {
	getRun,
	getScenario,
	type BenchRun,
	type BenchBlock,
} from '#data/mock'
import { formatGas, formatTps, formatMs, formatDate } from '#lib/format'

export const Route = createFileRoute('/run/$id')({
	component: RunDetailPage,
})

function RunDetailPage(): React.JSX.Element {
	const { id } = Route.useParams()
	const run = getRun(id)

	if (!run) {
		return (
			<div className="py-20 text-center text-content-secondary">
				Run not found.
			</div>
		)
	}

	const scenario = getScenario(run.scenarioId)

	return (
		<div>
			<div className="mb-2">
				{scenario ? (
					<Link
						to="/scenario/$id"
						params={{ id: scenario.id }}
						className="text-xs text-content-tertiary transition-colors hover:text-content-primary"
					>
						← {scenario.label}
					</Link>
				) : (
					<Link
						to="/"
						className="text-xs text-content-tertiary transition-colors hover:text-content-primary"
					>
						← Back to dashboard
					</Link>
				)}
			</div>

			<section className="mb-8">
				<h2 className="text-xl font-semibold text-content-primary">
					Run{' '}
					<code className="font-mono text-base text-accent">{run.commit}</code>
				</h2>
				<p className="mt-1 text-sm text-content-secondary">
					{formatDate(run.timestamp)} · {run.blocks.length} blocks
					{scenario && ` · ${scenario.workload}`}
				</p>
			</section>

			<section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
				<MetricCard
					label="Avg Throughput"
					value={formatGas(run.avgGasPerSecond)}
					accent
				/>
				<MetricCard
					label="Peak Throughput"
					value={formatGas(run.peakGasPerSecond)}
				/>
				<MetricCard label="Avg TPS" value={formatTps(run.avgTps)} />
				<MetricCard
					label="Block Time"
					value={formatMs(run.avgBlockTimeMs)}
				/>
				<MetricCard label="P50 Latency" value={formatMs(run.p50LatencyMs)} />
				<MetricCard label="P99 Latency" value={formatMs(run.p99LatencyMs)} />
			</section>

			<section className="mb-10">
				<h3 className="mb-4 text-sm font-semibold text-content-primary">
					Gas Per Block
				</h3>
				<GasChart blocks={run.blocks} />
			</section>

			<section className="mb-10">
				<h3 className="mb-4 text-sm font-semibold text-content-primary">
					Execution Time Per Block
				</h3>
				<ExecTimeChart blocks={run.blocks} />
			</section>

			<section>
				<h3 className="mb-4 text-sm font-semibold text-content-primary">
					Block Details
				</h3>
				<div className="overflow-hidden rounded-lg border border-border">
					<div className="max-h-96 overflow-y-auto">
						<table className="w-full text-sm">
							<thead className="sticky top-0">
								<tr className="border-b border-border bg-surface text-left text-xs text-content-secondary">
									<th className="px-4 py-3 font-medium">Block</th>
									<th className="px-4 py-3 font-medium text-right">
										Gas Used
									</th>
									<th className="px-4 py-3 font-medium text-right">Txs</th>
									<th className="px-4 py-3 font-medium text-right">
										Exec Time
									</th>
								</tr>
							</thead>
							<tbody>
								{run.blocks.map((block) => (
									<tr
										key={block.number}
										className="border-b border-border-subtle last:border-0 transition-colors hover:bg-surface-hover"
									>
										<td className="px-4 py-2 font-mono text-xs text-content-primary">
											#{block.number}
										</td>
										<td className="px-4 py-2 text-right font-mono text-xs text-content-primary">
											{formatGas(block.gasUsed)}
										</td>
										<td className="px-4 py-2 text-right font-mono text-xs text-content-primary">
											{block.txCount.toLocaleString()}
										</td>
										<td className="px-4 py-2 text-right font-mono text-xs text-content-primary">
											{formatMs(block.executionTimeMs)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
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

function GasChart(props: { blocks: Array<BenchBlock> }): React.JSX.Element {
	const { blocks } = props
	const maxGas = Math.max(...blocks.map((b) => b.gasUsed))

	return (
		<div className="rounded-lg border border-border bg-surface p-4">
			<div className="flex h-40 items-end gap-px">
				{blocks.map((block) => {
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
						</div>
					)
				})}
			</div>
			<div className="mt-2 flex justify-between text-[10px] text-content-tertiary">
				<span>#{blocks[0]?.number}</span>
				<span>#{blocks.at(-1)?.number}</span>
			</div>
		</div>
	)
}

function ExecTimeChart(props: {
	blocks: Array<BenchBlock>
}): React.JSX.Element {
	const { blocks } = props
	const maxExec = Math.max(...blocks.map((b) => b.executionTimeMs))

	return (
		<div className="rounded-lg border border-border bg-surface p-4">
			<div className="flex h-32 items-end gap-px">
				{blocks.map((block) => {
					const height = (block.executionTimeMs / maxExec) * 100
					const color =
						block.executionTimeMs > 120
							? 'bg-negative/60 group-hover:bg-negative'
							: block.executionTimeMs > 80
								? 'bg-warning/60 group-hover:bg-warning'
								: 'bg-positive/60 group-hover:bg-positive'
					return (
						<div
							key={block.number}
							className="group relative flex-1"
							style={{ height: '100%' }}
						>
							<div
								className={`absolute bottom-0 w-full rounded-t-sm transition-colors ${color}`}
								style={{ height: `${height}%` }}
							/>
						</div>
					)
				})}
			</div>
			<div className="mt-2 flex justify-between text-[10px] text-content-tertiary">
				<span>#{blocks[0]?.number}</span>
				<span>#{blocks.at(-1)?.number}</span>
			</div>
		</div>
	)
}
