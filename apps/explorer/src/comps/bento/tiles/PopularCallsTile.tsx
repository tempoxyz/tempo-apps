import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { TokenIcon } from '#comps/TokenIcon'
import { getAccountTag } from '#lib/account'
import { landingPopularCallsQueryOptions } from '#lib/queries'
import type { TxRateWindow } from '#lib/server/landing-stats'
import ZapIcon from '~icons/lucide/zap'

const WINDOW_OPTIONS: ReadonlyArray<{ value: TxRateWindow; label: string }> = [
	{ value: '1h', label: '1h' },
	{ value: '24h', label: '24h' },
	{ value: '7d', label: '7d' },
]

const KNOWN_SELECTORS: Record<string, string> = {
	'0xa9059cbb': 'transfer',
	'0x23b872dd': 'transferFrom',
	'0x095ea7b3': 'approve',
	'0x40c10f19': 'mint',
	'0x42966c68': 'burn',
	'0x79cc6790': 'burnFrom',
	'0x9dc29fac': 'burn',
	'0xd505accf': 'permit',
	'0x8456cb59': 'pause',
	'0x3f4ba83a': 'unpause',
}

function selectorLabel(selector: string): string {
	return KNOWN_SELECTORS[selector.toLowerCase()] ?? selector
}

function addressLabel(address: string): string {
	const tag = getAccountTag(address as `0x${string}`)
	if (tag?.label) return tag.label
	return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function PopularCallsTile(): React.JSX.Element {
	const [window, setWindow] = React.useState<TxRateWindow>('24h')
	const { data, isPending, isError, refetch } = useQuery(
		landingPopularCallsQueryOptions(window),
	)

	const rows = data ?? []
	const isEmpty = !isPending && !isError && rows.length === 0

	return (
		<BentoTile
			title="Popular calls"
			action={
				<BentoTile.SelectAction<TxRateWindow>
					value={window}
					options={WINDOW_OPTIONS}
					onChange={setWindow}
					ariaLabel="popular calls window"
				/>
			}
			span={{ base: 2, sm: 2, lg: 2 }}
			rowSpan={{ base: 2, lg: 2 }}
			status={
				isPending ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'
			}
			empty={{ icon: <ZapIcon />, label: 'No activity in window' }}
			onRetry={() => refetch()}
			contentClassName="gap-0"
		>
			<ul className="flex flex-col divide-y divide-card-border/60">
				{rows.slice(0, 8).map((r, i) => (
					<li
						key={`${r.to}-${r.selector}-${i}`}
						className="grid grid-cols-[16px_120px_1fr_auto] items-center gap-2 py-1.5 text-[12px]"
					>
						<TokenIcon address={r.to} className="size-4" />
						<Link
							to="/address/$address"
							params={{ address: r.to }}
							className="text-primary press-down-mini hover:text-accent truncate font-medium"
						>
							{addressLabel(r.to)}
						</Link>
						<span className="font-mono text-tertiary truncate text-[11px]">
							{selectorLabel(r.selector)}
						</span>
						<span className="font-mono tabular-nums text-[11.5px] text-primary text-right">
							{r.count.toLocaleString()}
						</span>
					</li>
				))}
			</ul>
		</BentoTile>
	)
}
