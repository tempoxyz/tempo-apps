import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { RelativeTime } from '#comps/RelativeTime'
import { cx } from '#lib/css'
import { HexFormatter } from '#lib/formatting'
import { landingNotableTxsQueryOptions } from '#lib/queries'
import type { TxRateWindow } from '#lib/server/landing-stats'
import ReceiptIcon from '~icons/lucide/receipt'

const WINDOW_OPTIONS: ReadonlyArray<{ value: TxRateWindow; label: string }> = [
	{ value: '1h', label: '1h' },
	{ value: '24h', label: '24h' },
	{ value: '7d', label: '7d' },
]

// Single grid template shared by header + rows so columns line up exactly.
// Index | Description | Hash | Gwei | Block share | Age
const GRID =
	'grid-cols-[20px_1fr_minmax(72px,auto)_64px_56px_88px] sm:grid-cols-[24px_1fr_120px_72px_72px_104px]'

export function NotableTxsTile(): React.JSX.Element {
	const [window, setWindow] = React.useState<TxRateWindow>('24h')
	const { data, isPending, isError, refetch } = useQuery(
		landingNotableTxsQueryOptions(window),
	)

	const rows = data?.rows ?? []
	const isEmpty = !isPending && !isError && rows.length === 0

	return (
		<BentoTile
			title="Notable transactions"
			span={{ base: 2, sm: 4, lg: 6 }}
			rowSpan={{ base: 2, lg: 2 }}
			status={
				isPending ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'
			}
			empty={{ icon: <ReceiptIcon />, label: 'No transactions in window' }}
			onRetry={() => refetch()}
			action={
				<BentoTile.SelectAction<TxRateWindow>
					value={window}
					options={WINDOW_OPTIONS}
					onChange={setWindow}
					ariaLabel="notable transactions window"
				/>
			}
			contentClassName="gap-0"
		>
			<ul className="flex flex-1 min-h-0 flex-col divide-y divide-card-border/60 overflow-auto">
				<li
					className={cx(
						'grid items-center gap-3 h-7 px-1 text-[10px] uppercase tracking-[0.06em] text-tertiary',
						GRID,
					)}
					aria-hidden
				>
					<span className="text-right tabular-nums">#</span>
					<span>Description</span>
					<span className="text-right hidden sm:block">Hash</span>
					<span className="text-right tabular-nums">Gwei</span>
					<span className="text-right">Block</span>
					<span className="text-right">Age</span>
				</li>
				{rows.map((row, i) => (
					<li key={`${row.hash}-${i}`}>
						<Link
							to="/tx/$hash"
							params={{ hash: row.hash }}
							className={cx(
								'grid items-center gap-3 h-9 px-1 -mx-1 text-[12px]',
								'rounded-sm hover:bg-base-alt/60 press-down-mini',
								GRID,
							)}
						>
							<span className="text-[10.5px] text-tertiary tabular-nums text-right">
								{i + 1}
							</span>
							<span className="text-primary truncate font-medium">
								{row.description}
							</span>
							<span className="font-mono text-accent text-[11px] tabular-nums text-right hidden sm:inline truncate">
								{HexFormatter.shortenHex(row.hash, 4)}
							</span>
							<span className="font-mono text-primary tabular-nums text-right text-[11.5px]">
								{row.gwei}
							</span>
							<BlockShareGauge value={row.blockShare} />
							<RelativeTime
								timestamp={BigInt(row.block_timestamp)}
								className="text-right text-tertiary tabular-nums text-[11px] whitespace-nowrap"
							/>
						</Link>
					</li>
				))}
			</ul>
		</BentoTile>
	)
}

function BlockShareGauge(props: { value: number }): React.JSX.Element {
	const pct = Math.max(0, Math.min(1, props.value)) * 100
	return (
		<div
			title={`${pct.toFixed(1)}% of block gas`}
			role="img"
			aria-label={`block share ${pct.toFixed(1)} percent`}
			className="h-[6px] w-full rounded-full bg-distinct overflow-hidden"
		>
			<div
				className="h-full bg-accent"
				style={{ width: `${Math.max(3, pct)}%` }}
			/>
		</div>
	)
}
