import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getScenario, fetchRun, type BenchBlock } from '#lib/server/bench'
import {
	formatGas,
	formatTps,
	formatMs,
	formatDate,
	formatAccounts,
} from '#lib/format'

export const Route = createFileRoute('/benchmark/$id')({
	component: RunDetailPage,
	loader: ({ params, context }) => {
		context.queryClient.ensureQueryData({
			queryKey: ['run', params.id],
			queryFn: () => fetchRun({ data: params.id }),
		})
	},
})

function RunDetailPage(): React.JSX.Element {
	const { id } = Route.useParams()
	const { data: run } = useSuspenseQuery({
		queryKey: ['run', id],
		queryFn: () => fetchRun({ data: id }),
	})

	if (!run) {
		return (
			<div className="py-20 text-center text-secondary">Benchmark not found.</div>
		)
	}

	const scenario = getScenario(run.scenarioId)

	return (
		<div>
			<div className="mb-4">
				{scenario ? (
					<Link
						to="/workload/$id"
						params={{ id: scenario.id }}
						className="text-[13px] text-tertiary transition-colors hover:text-primary"
					>
						← {scenario.label}
					</Link>
				) : (
					<Link
						to="/"
						className="text-[13px] text-tertiary transition-colors hover:text-primary"
					>
						← Dashboard
					</Link>
				)}
			</div>

			<section className="mb-8">
				<h2 className="text-[22px] font-bold tracking-tight text-primary">
					{run.commit ? (
						<>
							Benchmark{' '}
							<code className="font-mono text-[20px] text-accent">
								{run.commit}
							</code>
						</>
					) : (
						<>Benchmark — {formatDate(run.timestamp)}</>
					)}
				</h2>
				<p className="mt-2 text-[14px] text-secondary">
					{formatDate(run.timestamp)} · {run.blocks.length} blocks
					{scenario && ` · ${scenario.workload}`}
				</p>
			</section>

			<section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				<MetricCard
					label="Throughput"
					value={formatGas(run.avgGasPerSecond)}
					accent
				/>
				<MetricCard label="Peak" value={formatGas(run.peakGasPerSecond)} />
				<MetricCard label="Avg TPS" value={formatTps(run.avgTps)} />
				<MetricCard
					label="State Size"
					value={`${formatAccounts(run.stateAccounts)} accounts`}
				/>
				<MetricCard label="Block Time" value={formatMs(run.avgBlockTimeMs)} />
				<MetricCard label="P50 Latency" value={formatMs(run.p50LatencyMs)} />
				<MetricCard label="P99 Latency" value={formatMs(run.p99LatencyMs)} />
			</section>

			{run.blocks.length > 0 && (
				<section className="mb-10">
					<SectionHeader title="Gas Per Block" />
					<GasChart blocks={run.blocks} />
				</section>
			)}

			{run.blocks.length > 0 && (
				<section className="mb-10">
					<SectionHeader title="Execution Time Per Block" />
					<ExecTimeChart blocks={run.blocks} />
				</section>
			)}

			{run.blocks.length > 0 && (
				<section className="mb-14">
					<SectionHeader title="Block Details" />
					<div className="card">
						<div className="max-h-96 overflow-y-auto">
							<table className="w-full text-[13px]">
								<thead className="sticky top-0">
									<tr className="border-b border-border bg-surface-raised text-left text-tertiary">
										<th className="px-4.5 py-3 font-normal">Block</th>
										<th className="px-4.5 py-3 font-normal text-right">
											Gas Used
										</th>
										<th className="px-4.5 py-3 font-normal text-right">Txs</th>
										<th className="px-4.5 py-3 font-normal text-right">
											Exec Time
										</th>
									</tr>
								</thead>
								<tbody>
									{run.blocks.map((block: BenchBlock) => (
										<tr
											key={block.number}
											className="border-b border-dashed border-border last:border-0 transition-colors hover:bg-surface-hover"
										>
											<td className="px-4.5 py-2.5 font-mono text-[12px] text-primary">
												#{block.number}
											</td>
											<td className="px-4.5 py-2.5 text-right font-mono text-[12px] text-primary">
												{formatGas(block.gasUsed, false)}
											</td>
											<td className="px-4.5 py-2.5 text-right font-mono text-[12px] text-primary">
												{block.txCount.toLocaleString()}
											</td>
											<td className="px-4.5 py-2.5 text-right font-mono text-[12px] text-primary">
												{formatMs(block.executionTimeMs)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</section>
			)}
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

function GasChart(props: { blocks: Array<BenchBlock> }): React.JSX.Element {
	const { blocks } = props
	const maxGas = Math.max(...blocks.map((b) => b.gasUsed))

	return (
		<div className="card p-5">
			<div className="flex gap-3">
				<div className="flex h-44 shrink-0 flex-col justify-between text-right text-[10px] text-tertiary font-mono">
					<span>{formatGas(maxGas, false)}</span>
					<span>{formatGas(Math.round(maxGas / 2), false)}</span>
					<span>0</span>
				</div>
				<div className="min-w-0 flex-1 overflow-x-auto">
					<div className="flex h-44 items-end gap-[2px]">
						{blocks.map((block) => {
							const height = (block.gasUsed / maxGas) * 100
							return (
								<div
									key={block.number}
									className="group relative flex-1"
									style={{ minWidth: 6, height: '100%' }}
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
									</div>
								</div>
							)
						})}
					</div>
					<div className="mt-3 flex justify-between text-[11px] text-tertiary">
						<span>#{blocks[0]?.number}</span>
						<span>#{blocks.at(-1)?.number}</span>
					</div>
				</div>
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
		<div className="card p-5">
			<div className="flex gap-3">
				<div className="flex h-36 shrink-0 flex-col justify-between text-right text-[10px] text-tertiary font-mono">
					<span>{formatMs(maxExec)}</span>
					<span>{formatMs(Math.round(maxExec / 2))}</span>
					<span>0</span>
				</div>
				<div className="min-w-0 flex-1 overflow-x-auto">
					<div className="flex h-36 items-end gap-[2px]">
						{blocks.map((block) => {
							const height = (block.executionTimeMs / maxExec) * 100
							const color =
								block.executionTimeMs > 120
									? 'bg-negative/50 group-hover:bg-negative'
									: block.executionTimeMs > 80
										? 'bg-warning/50 group-hover:bg-warning'
										: 'bg-positive/50 group-hover:bg-positive'
							return (
								<div
									key={block.number}
									className="group relative flex-1"
									style={{ minWidth: 6, height: '100%' }}
								>
									<div
										className={`absolute bottom-0 w-full rounded-t-[2px] transition-all ${color}`}
										style={{ height: `${height}%` }}
									/>
									<div className="pointer-events-none absolute top-2 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-[11px] shadow-lg group-hover:block whitespace-nowrap">
										<div className="font-medium text-primary">
											Block #{block.number}
										</div>
										<div className="mt-1 text-secondary">
											{formatMs(block.executionTimeMs)}
										</div>
										<div className="text-secondary">{block.txCount} txs</div>
									</div>
								</div>
							)
						})}
					</div>
					<div className="mt-3 flex justify-between text-[11px] text-tertiary">
						<span>#{blocks[0]?.number}</span>
						<span>#{blocks.at(-1)?.number}</span>
					</div>
				</div>
			</div>
		</div>
	)
}
