import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/methodology')({
	component: MethodologyPage,
})

function MethodologyPage(): React.JSX.Element {
	return (
		<div className="max-w-3xl">
			<h2 className="mb-8 text-[28px] font-bold tracking-tight text-primary">
				Methodology
			</h2>

			<div className="space-y-8 text-[14px] leading-relaxed text-secondary">
				<Section title="Workload Composition">
					<p>
						The canonical benchmark workload consists of a representative mix of
						Tempo transaction types:
					</p>
					<ul className="mt-3 space-y-2">
						<li className="flex items-baseline gap-2">
							<span className="text-accent">60%</span>
							<span>
								<strong className="text-primary">TIP-20</strong> — Token
								transfer operations (ERC-20 equivalent)
							</span>
						</li>
						<li className="flex items-baseline gap-2">
							<span className="text-accent">20%</span>
							<span>
								<strong className="text-primary">MPP</strong> — Multi-party
								payment batches
							</span>
						</li>
						<li className="flex items-baseline gap-2">
							<span className="text-accent">20%</span>
							<span>
								<strong className="text-primary">DEX</strong> — Stablecoin DEX
								swap operations
							</span>
						</li>
					</ul>
				</Section>

				<Section title="Hardware">
					<p>
						Benchmarks run on dedicated bare-metal servers to ensure consistent
						results:
					</p>
					<div className="mt-3 card">
						<div className="divide-y divide-dashed divide-border">
							<HardwareRow label="CPU" value="AMD EPYC 9454P (48C/96T)" />
							<HardwareRow label="Memory" value="256 GB DDR5-4800" />
							<HardwareRow label="Storage" value="2× NVMe Gen4 in RAID-0" />
							<HardwareRow
								label="Network"
								value="25 Gbps between validator nodes"
							/>
						</div>
					</div>
				</Section>

				<Section title="Validator Configuration">
					<p>
						Tests are run with 10-validator and 20-validator configurations.
						Validators are distributed across separate physical machines
						connected via a private network to simulate realistic consensus
						conditions.
					</p>
				</Section>

				<Section title="Metrics">
					<div className="mt-3 card">
						<div className="divide-y divide-dashed divide-border">
							<MetricRow
								label="Throughput"
								description="Average and peak gas consumed per second across all blocks in the run."
							/>
							<MetricRow
								label="TPS"
								description="Transactions per second (derived from gas / avg tx gas)."
							/>
							<MetricRow
								label="P50/P99 Latency"
								description="Block execution time percentiles."
							/>
							<MetricRow
								label="Block Time"
								description="Average wall-clock time between blocks."
							/>
						</div>
					</div>
				</Section>

				<Section title="Data Pipeline">
					<p>
						Benchmark results are produced by{' '}
						<a
							href="https://github.com/tempoxyz/tempo/blob/main/bin/tempo-bench/README.md"
							target="_blank"
							rel="noopener noreferrer"
							className="text-accent hover:underline"
						>
							tempo-bench
						</a>
						.
					</p>
				</Section>
			</div>
		</div>
	)
}

function Section(props: {
	title: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<section>
			<h3 className="mb-3 text-[16px] font-semibold text-primary">
				{props.title}
			</h3>
			{props.children}
		</section>
	)
}

function HardwareRow(props: {
	label: string
	value: string
}): React.JSX.Element {
	return (
		<div className="flex items-center justify-between px-4.5 py-3">
			<span className="text-[13px] text-tertiary">{props.label}</span>
			<span className="font-mono text-[13px] text-primary">{props.value}</span>
		</div>
	)
}

function MetricRow(props: {
	label: string
	description: string
}): React.JSX.Element {
	return (
		<div className="flex items-center gap-4 px-4.5 py-3">
			<span className="shrink-0 text-[13px] font-medium text-primary w-28">
				{props.label}
			</span>
			<span className="text-[13px] text-secondary">{props.description}</span>
		</div>
	)
}
