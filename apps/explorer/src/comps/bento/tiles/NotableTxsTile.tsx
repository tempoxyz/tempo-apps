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

export function NotableTxsTile(): React.JSX.Element {
	const [window, setWindow] = React.useState<TxRateWindow>('24h')
	const { data, isPending, isError } = useQuery(
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
			<div
				className="grid grid-cols-[14px_1fr_64px_56px_44px] items-center gap-2 px-1 pb-1 text-[10px] uppercase tracking-[0.06em] text-tertiary"
				aria-hidden
			>
				<span className="text-right">#</span>
				<span>Description</span>
				<span className="text-right">Gwei</span>
				<span className="text-right">Block</span>
				<span className="text-right">Age</span>
			</div>
			<ul className="flex flex-1 min-h-0 flex-col divide-y divide-dashed divide-card-border overflow-auto">
				{rows.map((row, i) => (
					<li key={`${row.hash}-${i}`}>
						<Link
							to="/tx/$hash"
							params={{ hash: row.hash }}
							className={cx(
								'grid grid-cols-[14px_1fr_64px_56px_44px] items-center gap-2 py-1.5 text-[12px]',
								'hover:bg-base-alt/60 press-down-mini -mx-1 px-1 rounded-sm',
							)}
						>
							<span className="text-[10px] text-tertiary tabular-nums text-right">
								{i + 1}
							</span>
							<span className="flex items-center gap-1.5 min-w-0">
								<span className="font-sans text-primary truncate font-medium">
									{row.description}
								</span>
								<span className="font-mono text-accent text-[10.5px] shrink-0 hidden sm:inline">
									{HexFormatter.shortenHex(row.hash, 3)}
								</span>
							</span>
							<span className="font-mono text-primary tabular-nums text-right text-[11.5px]">
								{row.gwei}
							</span>
							<BlockShareGauge value={row.blockShare} />
							<RelativeTime
								timestamp={BigInt(row.block_timestamp)}
								className="text-right text-tertiary tabular-nums text-[10.5px]"
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
			className="h-[6px] rounded-full bg-base-alt overflow-hidden"
		>
			<div
				className="h-full bg-accent/70"
				style={{ width: `${Math.max(2, pct)}%` }}
			/>
		</div>
	)
}
