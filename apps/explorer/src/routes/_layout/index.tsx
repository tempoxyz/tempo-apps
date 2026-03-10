import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { ExploreInput } from '#comps/ExploreInput'
import { Intro } from '#comps/Intro'
import { cx } from '#lib/css'
import { withLoaderTiming } from '#lib/profiling'
import { fetchHomepageMetrics } from '#lib/server/home-metrics'
import type { ExplorerHomepageMetrics } from '#lib/server/tempo-queries'

const compactCountFormatter = new Intl.NumberFormat('en-US', {
	maximumFractionDigits: 1,
	notation: 'compact',
})

const fullCountFormatter = new Intl.NumberFormat('en-US', {
	maximumFractionDigits: 0,
})

export const Route = createFileRoute('/_layout/')({
	loader: () =>
		withLoaderTiming('/_layout/', async () => ({
			metrics: await fetchHomepageMetrics(),
		})),
	component: Component,
})

function Component(): React.JSX.Element {
	const router = useRouter()
	const navigate = useNavigate()
	const { metrics } = Route.useLoaderData()
	const [inputValue, setInputValue] = React.useState('')

	React.useEffect(() => {
		return router.subscribe('onResolved', ({ hrefChanged }) => {
			if (hrefChanged) setInputValue('')
		})
	}, [router])

	return (
		<div className="flex flex-1 w-full flex-col text-[16px]">
			<div className="flex min-h-[42svh] flex-col justify-end">
				<div className="flex justify-center select-none [@media(max-height:360px)]:hidden">
					<Intro />
				</div>
			</div>
			<div className="flex grow flex-col items-center px-4 pt-8 pb-16">
				<div className="w-full max-w-[560px] relative z-20">
					<ExploreInput
						autoFocus
						size="large"
						wide
						className="bg-base-alt"
						value={inputValue}
						onChange={setInputValue}
						onActivate={(data) => {
							if (data.type === 'block') {
								navigate({
									to: '/block/$id',
									params: { id: data.value },
								})
								return
							}
							if (data.type === 'hash') {
								navigate({
									to: '/receipt/$hash',
									params: { hash: data.value },
								})
								return
							}
							if (data.type === 'token') {
								navigate({
									to: '/token/$address',
									params: { address: data.value },
								})
								return
							}
							if (data.type === 'address') {
								navigate({
									to: '/address/$address',
									params: { address: data.value },
								})
								return
							}
						}}
					/>
				</div>
				{metrics ? <HomepageMetrics metrics={metrics} /> : null}
			</div>
		</div>
	)
}

function HomepageMetrics(props: {
	metrics: ExplorerHomepageMetrics
}): React.JSX.Element {
	const cards = [
		{
			copy: 'Submitted across the network.',
			label: 'Transactions',
			metric: props.metrics.transactions,
		},
		{
			copy: 'New contracts created from indexed receipts.',
			label: 'Contracts deployed',
			metric: props.metrics.contracts,
		},
		{
			copy: 'Token launches indexed by the explorer.',
			label: 'Tokens launched',
			metric: props.metrics.tokens,
		},
	] as const

	return (
		<section className="mt-6 w-full max-w-[980px]">
			<div className="flex flex-col items-center gap-3 text-center">
				<p className="text-[11px] font-medium uppercase tracking-[0.24em] text-tertiary">
					Network Snapshot
				</p>
				<p className="max-w-[640px] text-[13px] leading-5 text-secondary">
					Indexed explorer totals with fresh activity from the last 24 hours.
				</p>
			</div>
			<div className="mt-4 grid gap-3 md:grid-cols-3">
				{cards.map((card) => (
					<MetricCard
						key={card.label}
						copy={card.copy}
						label={card.label}
						metric={card.metric}
					/>
				))}
			</div>
		</section>
	)
}

function MetricCard(props: {
	copy: string
	label: string
	metric: ExplorerHomepageMetrics[keyof ExplorerHomepageMetrics]
}): React.JSX.Element {
	const hasRecentActivity = props.metric.last24h > 0

	return (
		<article className="relative overflow-hidden rounded-[18px] border border-base-border bg-card/80 p-4 shadow-[0px_18px_55px_rgba(0,0,0,0.18)]">
			<div className="pointer-events-none absolute top-[-28px] right-[-12px] h-24 w-24 rounded-full bg-accent/10 blur-2xl" />
			<div className="relative flex h-full flex-col">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<p className="text-[11px] font-medium uppercase tracking-[0.18em] text-tertiary">
							{props.label}
						</p>
						<p className="mt-2 text-[13px] leading-5 text-secondary">
							{props.copy}
						</p>
					</div>
					<span
						className={cx(
							'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium',
							hasRecentActivity
								? 'border-accent/20 bg-accent/10 text-accent'
								: 'border-base-border bg-base-alt text-tertiary',
						)}
					>
						{formatDeltaCount(props.metric.last24h)} / 24h
					</span>
				</div>
				<div className="mt-8 flex items-end gap-2">
					<p className="text-[30px] font-semibold tracking-[-0.06em] text-primary sm:text-[32px]">
						{formatCompactCount(props.metric.total)}
					</p>
					<p className="pb-1 text-[12px] text-tertiary">all time</p>
				</div>
				<p className="mt-2 font-mono text-[12px] text-secondary">
					{formatFullCount(props.metric.total)} total
				</p>
			</div>
		</article>
	)
}

function formatCompactCount(value: number): string {
	if (Math.abs(value) < 1000) return formatFullCount(value)

	return compactCountFormatter.format(value)
}

function formatDeltaCount(value: number): string {
	const formatted = formatFullCount(value)

	return value > 0 ? `+${formatted}` : formatted
}

function formatFullCount(value: number): string {
	return fullCountFormatter.format(value)
}
