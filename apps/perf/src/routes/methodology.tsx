import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/methodology')({
	component: MethodologyPage,
})

function MethodologyPage(): React.JSX.Element {
	return (
		<div className="max-w-3xl">
			<h2 className="mb-6 text-xl font-semibold text-content-primary">
				Methodology
			</h2>

			<div className="space-y-8 text-sm leading-relaxed text-content-secondary">
				<Section title="Workload Composition">
					<p>
						The canonical benchmark workload consists of a representative mix of
						Tempo transaction types:
					</p>
					<ul className="mt-2 list-inside list-disc space-y-1">
						<li>
							<strong className="text-content-primary">60% TIP-20</strong> —
							Token transfer operations (ERC-20 equivalent)
						</li>
						<li>
							<strong className="text-content-primary">20% MPP</strong> — Multi-party payment batches
						</li>
						<li>
							<strong className="text-content-primary">20% DEX</strong> — Stablecoin DEX swap
							operations
						</li>
					</ul>
				</Section>

				<Section title="Hardware">
					<p>
						Benchmarks run on dedicated bare-metal servers to ensure consistent
						results:
					</p>
					<ul className="mt-2 list-inside list-disc space-y-1">
						<li>CPU: AMD EPYC 9454P (48C/96T)</li>
						<li>Memory: 256 GB DDR5-4800</li>
						<li>Storage: 2× NVMe Gen4 in RAID-0</li>
						<li>Network: 25 Gbps between validator nodes</li>
					</ul>
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
					<ul className="list-inside list-disc space-y-1">
						<li>
							<strong className="text-content-primary">Throughput</strong> —
							Average and peak gas consumed per second across all blocks in the
							run.
						</li>
						<li>
							<strong className="text-content-primary">TPS</strong> —
							Transactions per second (derived from gas / avg tx gas).
						</li>
						<li>
							<strong className="text-content-primary">P50/P99 Latency</strong>{' '}
							— Block execution time percentiles.
						</li>
						<li>
							<strong className="text-content-primary">Block Time</strong> —
							Average wall-clock time between blocks.
						</li>
					</ul>
				</Section>

				<Section title="Data Pipeline">
					<p>
						Benchmark results are produced by{' '}
						<code className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-content-primary">
							tempo-bench
						</code>{' '}
						and written to ClickHouse. A nightly GitHub Actions workflow exports
						curated scenario results as JSON to a Cloudflare R2 bucket, which
						this dashboard reads from.
					</p>
				</Section>
			</div>
		</div>
	)
}

function Section(props: Section.Props): React.JSX.Element {
	return (
		<section>
			<h3 className="mb-2 text-base font-semibold text-content-primary">
				{props.title}
			</h3>
			{props.children}
		</section>
	)
}

declare namespace Section {
	type Props = {
		title: string
		children: React.ReactNode
	}
}
