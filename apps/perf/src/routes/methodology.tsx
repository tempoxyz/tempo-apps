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
						Current benchmarks use 100% TIP-20 token transfers (ERC-20
						equivalent) at varying target TPS levels.
					</p>
					<p className="mt-3">
						A canonical mixed workload combining TIP-20 transfers, multi-party
						payments, and stablecoin DEX swaps is in development.
					</p>
				</Section>

				<Section title="Hardware">
					<p>
						Benchmarks run on dedicated bare-metal servers to ensure consistent
						results:
					</p>
					<div className="mt-3 card">
						<div className="divide-y divide-dashed divide-border">
							<HardwareRow
								label="CPU"
								value="AMD EPYC 4585PX (16C/32T, 4.3/5.7 GHz)"
							/>
							<HardwareRow label="Memory" value="128 GB 3600 MHz" />
							<HardwareRow label="Storage">
								2×960 GB NVMe + 2×1.92 TB NVMe via{' '}
								<a
									href="https://github.com/tempoxyz/schelk"
									target="_blank"
									rel="noopener noreferrer"
									className="text-accent hover:underline"
								>
									schelk
								</a>
							</HardwareRow>
						</div>
					</div>
				</Section>

				<Section title="Node Configuration">
					<p>
						Benchmarks run in single-node dev mode on a dedicated bare-metal
						server.
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
	value?: string
	children?: React.ReactNode
}): React.JSX.Element {
	return (
		<div className="flex items-center justify-between px-4.5 py-3">
			<span className="text-[13px] text-tertiary">{props.label}</span>
			<span className="font-mono text-[13px] text-primary">
				{props.children ?? props.value}
			</span>
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
