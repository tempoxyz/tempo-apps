import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { landingTxRateQueryOptions } from '#lib/queries'
import type { TxRateWindow } from '#lib/server/landing-stats'
import ActivityIcon from '~icons/lucide/activity'

const WINDOW_OPTIONS: ReadonlyArray<{ value: TxRateWindow; label: string }> = [
	{ value: '1h', label: '1h' },
	{ value: '24h', label: '24h' },
	{ value: '7d', label: '7d' },
]

function formatTps(rate: number): string {
	if (rate >= 100) return rate.toFixed(0)
	if (rate >= 10) return rate.toFixed(1)
	return rate.toFixed(2)
}

export function TpsTile(): React.JSX.Element {
	const [window, setWindow] = React.useState<TxRateWindow>('24h')
	const { data, isPending, isError, refetch } = useQuery(
		landingTxRateQueryOptions(window),
	)

	const rate = data ? data.count / data.windowSecs : 0
	const isEmpty = !isPending && !isError && data?.count === 0

	return (
		<BentoTile
			title="TPS"
			action={
				<BentoTile.SelectAction<TxRateWindow>
					value={window}
					options={WINDOW_OPTIONS}
					onChange={setWindow}
					ariaLabel="TPS window"
				/>
			}
			span={{ base: 1, sm: 1, lg: 1 }}
			rowSpan={{ base: 1, lg: 1 }}
			status={
				isPending ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'
			}
			empty={{ icon: <ActivityIcon />, label: 'No activity' }}
			onRetry={() => refetch()}
			contentClassName="justify-end"
		>
			<BentoTile.PrimaryValue
				value={data ? formatTps(rate) : '—'}
				suffix="/s"
				className="text-[40px] tracking-[-0.025em]"
			/>
		</BentoTile>
	)
}
