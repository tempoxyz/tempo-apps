import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { waapi, stagger } from 'animejs'
import type * as React from 'react'
import { useEffect, useRef } from 'react'
import { Address } from '#comps/Address'
import { Midcut } from '#comps/Midcut'
import { RelativeTime } from '#comps/RelativeTime'
import { cx } from '#lib/css'
import { springSmooth } from '#lib/animation'
import {
	dashboardQueryOptions,
	networkStatsQueryOptions,
	tokensListQueryOptions,
	validatorsQueryOptions,
	type DashboardBlock,
	type DashboardTransaction,
} from '#lib/queries'
import type { Token } from '#lib/server/tokens.server'
import BoxIcon from '~icons/lucide/box'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import ClockIcon from '~icons/lucide/clock'
import CoinsIcon from '~icons/lucide/coins'
import ShieldCheckIcon from '~icons/lucide/shield-check'
import ZapIcon from '~icons/lucide/zap'
import ActivityIcon from '~icons/lucide/activity'

export function Dashboard(props: Dashboard.Props): React.JSX.Element | null {
	const { visible } = props
	const containerRef = useRef<HTMLDivElement>(null)

	const { data, isLoading } = useQuery({
		...dashboardQueryOptions(),
		enabled: visible,
	})

	const { data: stats, isLoading: statsLoading } = useQuery({
		...networkStatsQueryOptions(),
		enabled: visible,
	})

	const { data: tokensData, isLoading: tokensLoading } = useQuery({
		...tokensListQueryOptions({ page: 1, limit: 5 }),
		enabled: visible,
	})

	const { data: validators, isLoading: validatorsLoading } = useQuery({
		...validatorsQueryOptions(),
		enabled: visible,
	})

	const avgBlockTime = data?.blocks ? calculateAvgBlockTime(data.blocks) : null
	const tps = data?.blocks ? calculateTPS(data.blocks) : null

	useEffect(() => {
		if (!visible || !containerRef.current) return
		const children = [...containerRef.current.children]
		waapi.animate(children as HTMLElement[], {
			opacity: [0, 1],
			translateY: [12, 0],
			ease: springSmooth,
			delay: stagger(40, { start: 100 }),
		})
	}, [visible])

	if (!visible) return null

	return (
		<div
			ref={containerRef}
			className="w-full max-w-[1000px] mx-auto px-4 mt-8 flex flex-col gap-4"
		>
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<StatCard
					title="Transactions"
					value={stats?.totalTransactions}
					subtitle={stats?.transactions24h}
					subtitleLabel="24h"
					icon={<ActivityIcon className="size-[16px]" />}
					loading={statsLoading}
				/>
				<TPSCard tps={tps} loading={isLoading} />
				<AvgBlockTimeCard avgBlockTime={avgBlockTime} loading={isLoading} />
				<StatCard
					title="Validators"
					value={validators?.filter((v) => v.active).length}
					icon={<ShieldCheckIcon className="size-[16px]" />}
					loading={validatorsLoading}
					href="/validators"
				/>
			</div>
			<Card
				title="Recent Transactions"
				icon={<ZapIcon className="size-[14px]" />}
				loading={isLoading}
			>
				{data?.transactions.map((tx) => (
					<TransactionRow key={tx.hash} transaction={tx} />
				))}
			</Card>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<Card
					title="Recent Blocks"
					icon={<BoxIcon className="size-[14px]" />}
					viewAllLink="/blocks"
					loading={isLoading}
				>
					{data?.blocks.map((block) => (
						<BlockRow key={block.hash} block={block} />
					))}
				</Card>
				<Card
					title="Top Tokens"
					icon={<CoinsIcon className="size-[14px]" />}
					viewAllLink="/tokens"
					loading={tokensLoading}
				>
					{tokensData?.tokens.map((token) => (
						<TokenRow key={token.address} token={token} />
					))}
				</Card>
			</div>
		</div>
	)
}

export declare namespace Dashboard {
	type Props = {
		visible: boolean
	}
}

type StatCardProps = {
	title: string
	value: number | undefined
	subtitle?: number | undefined
	subtitleLabel?: string
	icon: React.ReactNode
	loading?: boolean
	href?: string
}

function formatNumber(num: number): string {
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`
	}
	if (num >= 1_000) {
		return `${(num / 1_000).toFixed(1)}K`
	}
	return num.toLocaleString()
}

function StatCard(props: StatCardProps): React.JSX.Element {
	const { title, value, subtitle, subtitleLabel, icon, loading, href } = props

	const content = (
		<>
			<div className="flex items-center justify-between text-tertiary text-[12px] mb-2">
				<div className="flex items-center gap-2">
					<span className="text-accent">{icon}</span>
					{title}
				</div>
				{href && <ArrowRightIcon className="size-[12px]" />}
			</div>
			{loading ? (
				<div className="space-y-2">
					<div className="h-7 w-24 bg-base-alt rounded animate-pulse" />
					<div className="h-4 w-16 bg-base-alt rounded animate-pulse" />
				</div>
			) : (
				<>
					<div className="text-[24px] font-semibold text-primary tabular-nums">
						{value !== undefined ? formatNumber(value) : '—'}
					</div>
					{subtitle !== undefined && subtitle > 0 && (
						<div className="text-[12px] text-positive tabular-nums">
							+{formatNumber(subtitle)} {subtitleLabel}
						</div>
					)}
				</>
			)}
		</>
	)

	if (href) {
		return (
			<Link
				to={href}
				className="bg-surface border border-base-border rounded-lg p-4"
			>
				{content}
			</Link>
		)
	}

	return (
		<div className="bg-surface border border-base-border rounded-lg p-4">
			{content}
		</div>
	)
}

function Skeleton(): React.JSX.Element {
	const items = [1, 2, 3, 4, 5]
	return (
		<>
			{items.map((n) => (
				<div key={n} className="px-4 py-3 flex items-center gap-3">
					<div className="size-8 bg-base-alt rounded-md animate-pulse" />
					<div className="flex-1 space-y-2">
						<div className="h-4 w-24 bg-base-alt rounded animate-pulse" />
						<div className="h-3 w-32 bg-base-alt rounded animate-pulse" />
					</div>
				</div>
			))}
		</>
	)
}

type CardProps = {
	title: string
	icon: React.ReactNode
	viewAllLink?: string
	loading?: boolean
	children: React.ReactNode
}

function Card(props: CardProps): React.JSX.Element {
	const { title, icon, viewAllLink, loading, children } = props
	return (
		<div className="bg-surface border border-base-border rounded-lg overflow-hidden">
			<div className="flex items-center justify-between px-4 py-3 border-b border-base-border">
				<div className="flex items-center gap-2 text-[13px] font-medium text-primary">
					<span className="text-accent">{icon}</span>
					{title}
				</div>
				{viewAllLink && (
					<Link
						to={viewAllLink}
						className="text-[12px] text-accent hover:underline flex items-center gap-1"
					>
						View all
						<ArrowRightIcon className="size-[12px]" />
					</Link>
				)}
			</div>
			<div className="divide-y divide-base-border">
				{loading ? <Skeleton /> : children}
			</div>
		</div>
	)
}

function BlockRow(props: { block: DashboardBlock }): React.JSX.Element {
	const { block } = props
	const blockNumber = block.number?.toString() ?? '0'
	const txCount = Array.isArray(block.transactions)
		? block.transactions.length
		: 0

	return (
		<Link
			to="/block/$id"
			params={{ id: blockNumber }}
			className={cx(
				'flex items-center justify-between px-4 py-3 hover:bg-base-alt transition-colors text-[13px]',
				'group cursor-pointer',
			)}
		>
			<div className="flex items-center gap-3 min-w-0">
				<div className="flex items-center justify-center size-8 rounded-md bg-accent/10 text-accent shrink-0">
					<BoxIcon className="size-[14px]" />
				</div>
				<div className="flex flex-col min-w-0">
					<span className="text-accent font-medium tabular-nums">
						#{blockNumber}
					</span>
					<span className="text-tertiary text-[12px]">
						{txCount} transaction{txCount !== 1 ? 's' : ''}
					</span>
				</div>
			</div>
			<div className="flex flex-col items-end shrink-0">
				{block.hash && (
					<span className="text-secondary font-mono text-[12px]">
						<Midcut value={block.hash} prefix="0x" min={4} />
					</span>
				)}
				{block.timestamp && (
					<span className="text-tertiary text-[11px]">
						<RelativeTime timestamp={block.timestamp} />
					</span>
				)}
			</div>
		</Link>
	)
}

function TransactionRow(props: {
	transaction: DashboardTransaction
}): React.JSX.Element {
	const { transaction } = props

	return (
		<Link
			to="/receipt/$hash"
			params={{ hash: transaction.hash }}
			className={cx(
				'flex items-center justify-between px-4 py-3 hover:bg-base-alt transition-colors text-[13px]',
				'group cursor-pointer',
			)}
		>
			<div className="flex items-center gap-3 min-w-0">
				<div className="flex items-center justify-center size-8 rounded-md bg-positive/10 text-positive shrink-0">
					<ZapIcon className="size-[14px]" />
				</div>
				<div className="flex flex-col min-w-0">
					<span className="text-secondary font-mono text-[12px]">
						<Midcut value={transaction.hash} prefix="0x" min={6} />
					</span>
					<div className="flex items-center gap-1 text-tertiary text-[12px]">
						<span>From</span>
						<Address address={transaction.from} chars={4} />
						{transaction.to && (
							<>
								<ArrowRightIcon className="size-[10px]" />
								<Address address={transaction.to} chars={4} />
							</>
						)}
					</div>
				</div>
			</div>
			<div className="flex flex-col items-end shrink-0">
				<span className="text-tertiary text-[12px] tabular-nums">
					Block #{transaction.blockNumber.toString()}
				</span>
				{transaction.timestamp && (
					<span className="text-tertiary text-[11px]">
						<RelativeTime timestamp={transaction.timestamp} />
					</span>
				)}
			</div>
		</Link>
	)
}

function calculateAvgBlockTime(blocks: DashboardBlock[]): number | null {
	if (blocks.length < 2) return null
	const timestamps = blocks.map((b) => Number(b.timestamp))
	let totalDiff = 0
	for (let i = 0; i < timestamps.length - 1; i++) {
		totalDiff += timestamps[i] - timestamps[i + 1]
	}
	return totalDiff / (timestamps.length - 1)
}

function calculateTPS(blocks: DashboardBlock[]): number | null {
	if (blocks.length < 2) return null
	const timestamps = blocks.map((b) => Number(b.timestamp))
	const timeSpan = timestamps[0] - timestamps[timestamps.length - 1]
	if (timeSpan <= 0) return null
	const totalTxs = blocks.reduce((sum, b) => {
		const txCount = Array.isArray(b.transactions) ? b.transactions.length : 0
		return sum + txCount
	}, 0)
	return totalTxs / timeSpan
}

function AvgBlockTimeCard(props: {
	avgBlockTime: number | null
	loading: boolean
}): React.JSX.Element {
	const { avgBlockTime, loading } = props

	return (
		<div className="bg-surface border border-base-border rounded-lg p-4">
			<div className="flex items-center gap-2 text-tertiary text-[12px] mb-2">
				<span className="text-accent">
					<ClockIcon className="size-[16px]" />
				</span>
				Avg Block Time
			</div>
			{loading ? (
				<div className="space-y-2">
					<div className="h-7 w-24 bg-base-alt rounded animate-pulse" />
				</div>
			) : (
				<div className="text-[24px] font-semibold text-primary tabular-nums">
					{avgBlockTime !== null ? `${avgBlockTime.toFixed(1)}s` : '—'}
				</div>
			)}
		</div>
	)
}

function TPSCard(props: {
	tps: number | null
	loading: boolean
}): React.JSX.Element {
	const { tps, loading } = props

	return (
		<div className="bg-surface border border-base-border rounded-lg p-4">
			<div className="flex items-center gap-2 text-tertiary text-[12px] mb-2">
				<span className="text-accent">
					<ZapIcon className="size-[16px]" />
				</span>
				TPS
			</div>
			{loading ? (
				<div className="space-y-2">
					<div className="h-7 w-24 bg-base-alt rounded animate-pulse" />
				</div>
			) : (
				<div className="text-[24px] font-semibold text-primary tabular-nums">
					{tps !== null ? tps.toFixed(2) : '—'}
				</div>
			)}
		</div>
	)
}

function TokenRow(props: { token: Token }): React.JSX.Element {
	const { token } = props

	return (
		<Link
			to="/token/$address"
			params={{ address: token.address }}
			className={cx(
				'flex items-center justify-between px-4 py-3 hover:bg-base-alt transition-colors text-[13px]',
				'group cursor-pointer',
			)}
		>
			<div className="flex items-center gap-3 min-w-0">
				<div className="flex items-center justify-center size-8 rounded-md bg-accent/10 text-accent shrink-0">
					<CoinsIcon className="size-[14px]" />
				</div>
				<div className="flex flex-col min-w-0">
					<span className="text-accent font-medium">{token.symbol}</span>
					<span className="text-tertiary text-[12px] truncate max-w-[200px]">
						{token.name}
					</span>
				</div>
			</div>
			<ArrowRightIcon className="size-[14px] text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
		</Link>
	)
}


