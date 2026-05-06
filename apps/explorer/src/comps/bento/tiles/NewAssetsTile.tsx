import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { RelativeTime } from '#comps/RelativeTime'
import { TokenIcon } from '#comps/TokenIcon'
import { landingTokenLaunchesQueryOptions } from '#lib/queries'
import SparklesIcon from '~icons/lucide/sparkles'

const LIST_LIMIT = 8

export function NewAssetsTile(): React.JSX.Element {
	const { data, isPending, isError } = useQuery(
		landingTokenLaunchesQueryOptions(),
	)

	const rows = data?.latest ?? []
	const isEmpty = !isPending && !isError && rows.length === 0

	return (
		<BentoTile
			title="New assets"
			span={{ base: 2, sm: 4, lg: 2 }}
			rowSpan={{ base: 1, lg: 1 }}
			status={
				isPending ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'
			}
			empty={{ icon: <SparklesIcon />, label: 'No launches in 30d' }}
			action={<BentoTile.PillAction to="/tokens">View</BentoTile.PillAction>}
			contentClassName="gap-0"
		>
			<ul className="flex flex-col divide-y divide-dashed divide-card-border overflow-auto">
				{rows.slice(0, LIST_LIMIT).map((t) => (
					<li key={t.address}>
						<Link
							to="/token/$address"
							params={{ address: t.address }}
							className="flex items-center gap-2 py-1.5 text-[12px] press-down-mini hover:bg-base-alt/60 -mx-1 px-1 rounded-sm"
						>
							<TokenIcon address={t.address} className="size-4" />
							<span className="text-primary font-medium truncate">
								{t.symbol}
							</span>
							<span className="text-tertiary truncate flex-1">{t.name}</span>
							<RelativeTime
								timestamp={BigInt(t.timestamp)}
								className="text-[10.5px] text-tertiary tabular-nums whitespace-nowrap"
							/>
						</Link>
					</li>
				))}
			</ul>
		</BentoTile>
	)
}
