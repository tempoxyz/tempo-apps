import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { BentoTile } from '#comps/bento/BentoTile'
import { cx } from '#lib/css'
import {
	landingRecentBlocksQueryOptions,
	validatorsQueryOptions,
} from '#lib/queries'
import ShieldIcon from '~icons/lucide/shield'

const LIST_LIMIT = 6

export function ValidatorsTile(): React.JSX.Element {
	const validators = useQuery(validatorsQueryOptions())
	const recent = useQuery(landingRecentBlocksQueryOptions())

	const { rows, active, total, windowBlocks } = React.useMemo(() => {
		const directory = validators.data ?? []
		const blocks = recent.data?.blocks ?? []

		// Map validator directory by lowercased address for fast lookup.
		const dirByAddress = new Map<string, (typeof directory)[number]>()
		for (const v of directory) {
			dirByAddress.set(v.validatorAddress.toLowerCase(), v)
		}

		// Tally miner occurrences from the recent window; these are the
		// actual block producers observed on-chain.
		const minerCounts = new Map<string, number>()
		for (const b of blocks) {
			const key = b.miner.toLowerCase()
			minerCounts.set(key, (minerCounts.get(key) ?? 0) + 1)
		}

		// Union: start with miners we observed, plus any active validator in
		// the directory that hasn't produced yet (so the list isn't empty on
		// a fresh window).
		const minerSet = new Set(minerCounts.keys())
		for (const v of directory) {
			if (v.active) minerSet.add(v.validatorAddress.toLowerCase())
		}

		const combined = Array.from(minerSet).map((addr) => {
			const dir = dirByAddress.get(addr)
			return {
				address: addr as `0x${string}`,
				name: dir?.name,
				active: dir?.active ?? minerCounts.has(addr),
				count: minerCounts.get(addr) ?? 0,
			}
		})

		combined.sort((a, b) => {
			if (b.count !== a.count) return b.count - a.count
			if (!!b.active !== !!a.active) return Number(b.active) - Number(a.active)
			return (a.name ?? a.address).localeCompare(b.name ?? b.address)
		})

		const maxCount = Math.max(1, ...combined.map((v) => v.count))
		const visible = combined.slice(0, LIST_LIMIT).map((v) => ({
			...v,
			share: v.count / maxCount,
		}))

		const activeCount = directory.filter((v) => v.active).length
		return {
			rows: visible,
			active: activeCount,
			total: directory.length,
			windowBlocks: blocks.length,
		}
	}, [validators.data, recent.data])

	const isLoading = validators.isPending
	const isError = validators.isError
	const isEmpty = !isLoading && !isError && rows.length === 0

	return (
		<BentoTile
			title="Validators"
			span={{ base: 2, sm: 4, lg: 2 }}
			rowSpan={{ base: 2, sm: 2, lg: 2 }}
			status={
				isLoading ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'
			}
			empty={{ icon: <ShieldIcon />, label: 'No validators registered' }}
			onRetry={() => {
				validators.refetch()
				recent.refetch()
			}}
			action={
				<BentoTile.PillAction to="/validators">View</BentoTile.PillAction>
			}
			contentClassName="gap-1 justify-between"
		>
			<div>
				<div
					className="grid grid-cols-[10px_112px_1fr_56px] items-center gap-2 py-1 text-[10px] uppercase tracking-[0.06em] text-tertiary border-b border-card-border/60"
					aria-hidden
				>
					<span />
					<span>Validator</span>
					<span>Recent share</span>
					<span className="text-right">Blocks</span>
				</div>
				<ul className="flex flex-col divide-y divide-card-border/60">
					{rows.map((v) => {
						const label =
							v.name ?? `${v.address.slice(0, 6)}…${v.address.slice(-4)}`
						return (
							<li
								key={v.address}
								className="group/row grid grid-cols-[10px_112px_1fr_56px] items-center gap-2 py-1.5 text-[12px]"
							>
								<span
									className={cx(
										'size-[6px] rounded-full',
										v.active ? 'bg-positive animate-pulse' : 'bg-negative/70',
									)}
									aria-hidden
								/>
								<span className="text-primary truncate font-medium">
									{label}
								</span>
								<div className="h-[4px] rounded-full bg-base-alt overflow-hidden">
									<div
										className="h-full bg-accent/60 group-hover/row:bg-accent transition-[width,background-color] duration-200"
										style={{ width: `${Math.max(2, v.share * 100)}%` }}
									/>
								</div>
								<span className="font-mono tabular-nums text-[11.5px] text-tertiary text-right">
									{v.count}
								</span>
							</li>
						)
					})}
				</ul>
			</div>
			{total > 0 ? (
				<div className="flex items-center justify-between pt-1.5 text-[10.5px] text-tertiary border-t border-card-border/60">
					<span>
						<span className="font-mono text-primary tabular-nums">
							{active}
						</span>{' '}
						active · {total} registered
					</span>
					<span className="tabular-nums">Last {windowBlocks} blocks</span>
				</div>
			) : null}
		</BentoTile>
	)
}
