import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#lib/css'
import { landingTopTokensQueryOptions } from '#lib/queries'
import CoinsIcon from '~icons/lucide/coins'

const compactCount = new Intl.NumberFormat(undefined, {
	notation: 'compact',
	maximumFractionDigits: 0,
})

export function TopTokensTile(): React.JSX.Element {
	const { data, isPending, isError, refetch } = useQuery(
		landingTopTokensQueryOptions(),
	)

	const max = React.useMemo(() => {
		if (!data || data.length === 0) return 1
		return Math.max(1, ...data.map((t) => t.count))
	}, [data])

	const isEmpty = !isPending && !isError && (!data || data.length === 0)

	return (
		<BentoTile
			title="Top tokens by holder count"
			span={{ base: 2, sm: 2, lg: 2 }}
			rowSpan={{ base: 2, lg: 2 }}
			status={
				isPending ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'
			}
			empty={{ icon: <CoinsIcon />, label: 'No tokens indexed' }}
			onRetry={() => refetch()}
			action={<BentoTile.PillAction to="/tokens">View</BentoTile.PillAction>}
			contentClassName="gap-0"
		>
			<ul className="flex flex-col divide-y divide-card-border/60 mt-1">
				{(data ?? []).map((t, i) => {
					const pct = (t.count / max) * 100
					return (
						<li key={t.address}>
							<Link
								to="/address/$address"
								params={{ address: t.address }}
								search={{ tab: 'token' }}
								className={cx(
									'grid grid-cols-[14px_auto_1fr_auto] items-center gap-2 py-1.5 text-[13px]',
									'hover:bg-base-alt/60 press-down-mini',
								)}
							>
								<span className="w-[14px] text-[10px] text-tertiary tabular-nums text-right">
									{i + 1}
								</span>
								<span className="flex items-center gap-2 min-w-0 border-l border-card-border/50 pl-2">
									<TokenIcon address={t.address} className="size-4" />
									<span className="font-sans text-primary font-medium truncate">
										{t.symbol ||
											`${t.address.slice(0, 6)}…${t.address.slice(-4)}`}
									</span>
								</span>
								<div className="border-l border-card-border/50 pl-2 pr-1 flex items-center min-w-0">
									<div className="h-[6px] w-full rounded-full bg-base-alt overflow-hidden">
										<div
											className="h-full bg-accent/60"
											style={{ width: `${pct}%` }}
										/>
									</div>
								</div>
								<span className="border-l border-card-border/50 pl-2 font-mono text-primary tabular-nums text-[12px]">
									{t.capped
										? `>${compactCount.format(t.count)}`
										: t.count.toLocaleString()}
								</span>
							</Link>
						</li>
					)
				})}
			</ul>
		</BentoTile>
	)
}
