import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import type * as React from 'react'
import { Addresses } from 'viem/tempo'
import { Amount } from '#comps/Amount'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import {
	FormattedTimestamp,
	TimeColumnHeader,
	useTimeFormat,
} from '#comps/TimeFormat'
import { TokenIcon } from '#comps/TokenIcon'
import { isTip20Address } from '#lib/domain/tip20'
import { PriceFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import { withLoaderTiming } from '#lib/profiling'
import { feeAmmPoolsQueryOptions } from '#lib/queries'
import type { FeeAmmPool } from '#lib/server/fee-amm'

export const Route = createFileRoute('/_layout/fee-amm')({
	component: FeeAmmPage,
	head: () => ({
		meta: [{ title: 'Fee AMM – Tempo Explorer' }],
	}),
	loader: ({ context }) =>
		withLoaderTiming('/_layout/fee-amm', async () =>
			context.queryClient.ensureQueryData(feeAmmPoolsQueryOptions()),
		),
})

function FeeAmmPage(): React.JSX.Element {
	const loaderData = Route.useLoaderData()
	const { timeFormat, cycleTimeFormat, formatLabel } = useTimeFormat()
	const { data, isPending } = useQuery({
		...feeAmmPoolsQueryOptions(),
		initialData: loaderData,
	})
	const pools = data ?? []

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	const columns: DataGrid.Column[] = [
		{ label: 'Pool', align: 'start', width: '2fr', minWidth: 220 },
		{ label: 'Reserves', align: 'start', width: '3fr', minWidth: 280 },
		{ label: 'LP Supply', align: 'start', width: 140 },
		{
			label: (
				<TimeColumnHeader
					label="Created"
					formatLabel={formatLabel}
					onCycle={cycleTimeFormat}
					className="text-secondary hover:text-accent cursor-pointer transition-colors"
				/>
			),
			align: 'end',
			width: 170,
		},
		{
			label: (
				<TimeColumnHeader
					label="Last Mint"
					formatLabel={formatLabel}
					onCycle={cycleTimeFormat}
					className="text-secondary hover:text-accent cursor-pointer transition-colors"
				/>
			),
			align: 'end',
			width: 170,
		},
	]

	const stackedColumns: DataGrid.Column[] = [
		{ label: 'Pool', align: 'start', minWidth: 180 },
		{ label: 'Reserves', align: 'start', minWidth: 200 },
		{ label: 'Activity', align: 'end', minWidth: 130 },
	]

	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex flex-col gap-2">
				<h1 className="text-[32px] leading-none tracking-[-0.02em] font-semibold text-primary">
					Fee AMM
				</h1>
				<p className="text-sm text-secondary max-w-[720px]">
					Liquidity pools discovered from FeeAMM mint activity on{' '}
					<Link
						to="/address/$address"
						params={{ address: Addresses.feeManager }}
						className="text-accent hover:underline font-mono"
					>
						{Addresses.feeManager}
					</Link>
					.
				</p>
			</div>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Pools',
						totalItems: `${pools.length}`,
						itemsLabel: 'pools',
						autoCollapse: false,
						content: (
							<DataGrid
								columns={{ stacked: stackedColumns, tabs: columns }}
								items={(gridMode) =>
									pools.map((pool) => ({
										cells:
											gridMode === 'stacked'
												? [
														<PoolPairCell key="pool" pool={pool} compact />,
														<PoolReservesCell key="reserves" pool={pool} />,
														[
															renderTimestamp(
																pool.latestMintAt ?? pool.createdAt,
																timeFormat,
															),
															<span
																key="mints"
																className="text-tertiary text-nowrap"
															>
																{pool.mintCount} mint
																{pool.mintCount === 1 ? '' : 's'}
															</span>,
														],
													]
												: [
														<PoolPairCell key="pool" pool={pool} />,
														<PoolReservesCell key="reserves" pool={pool} />,
														[
															<span
																key="supply"
																className="text-secondary tabular-nums"
															>
																{PriceFormatter.format(pool.totalSupply)}
															</span>,
															<span
																key="mints"
																className="text-tertiary text-nowrap"
															>
																{pool.mintCount} mint
																{pool.mintCount === 1 ? '' : 's'}
															</span>,
														],
														renderTimestamp(pool.createdAt, timeFormat),
														renderTimestamp(pool.latestMintAt, timeFormat),
													],
									}))
								}
								totalItems={pools.length}
								page={1}
								loading={isPending}
								itemsLabel="pools"
								itemsPerPage={pools.length || 10}
								emptyState="No Fee AMM pools found."
								pagination={false}
							/>
						),
					},
				]}
				activeSection={0}
			/>
		</div>
	)
}

function renderTimestamp(
	timestamp: number | null,
	format: ReturnType<typeof useTimeFormat>['timeFormat'],
): React.ReactNode {
	if (timestamp == null) {
		return <span className="text-tertiary">—</span>
	}

	return (
		<FormattedTimestamp
			timestamp={BigInt(timestamp)}
			format={format}
			className="text-secondary whitespace-nowrap"
		/>
	)
}

export function PoolPairCell(props: PoolPairCell.Props): React.JSX.Element {
	const { pool, compact = false } = props

	return (
		<div className="flex flex-col gap-2 min-w-0">
			<div className="inline-flex items-center gap-2 min-w-0">
				<TokenIcon address={pool.userToken} />
				<PoolTokenLink
					address={pool.userToken}
					label={pool.userTokenSymbol ?? pool.userTokenName ?? pool.userToken}
				/>
				<span className="text-tertiary">→</span>
				<TokenIcon address={pool.validatorToken} />
				<PoolTokenLink
					address={pool.validatorToken}
					label={
						pool.validatorTokenSymbol ??
						pool.validatorTokenName ??
						pool.validatorToken
					}
				/>
			</div>
			{!compact ? (
				<span className="text-tertiary text-xs font-mono">{pool.poolId}</span>
			) : null}
		</div>
	)
}

export declare namespace PoolPairCell {
	type Props = {
		pool: FeeAmmPool
		compact?: boolean | undefined
	}
}

export function PoolReservesCell(
	props: PoolReservesCell.Props,
): React.JSX.Element {
	const { pool } = props

	return (
		<>
			<Amount
				value={pool.reserveUserToken}
				token={pool.userToken}
				decimals={pool.userTokenDecimals}
				symbol={pool.userTokenSymbol}
				short
				maxWidth={14}
			/>
			<Amount
				value={pool.reserveValidatorToken}
				token={pool.validatorToken}
				decimals={pool.validatorTokenDecimals}
				symbol={pool.validatorTokenSymbol}
				short
				maxWidth={14}
			/>
		</>
	)
}

export declare namespace PoolReservesCell {
	type Props = {
		pool: FeeAmmPool
	}
}

export function PoolTokenLink(props: PoolTokenLink.Props): React.JSX.Element {
	const { address, label } = props
	const to = isTip20Address(address) ? '/token/$address' : '/address/$address'

	return (
		<Link
			to={to}
			params={{ address }}
			className="text-accent hover:underline truncate"
			title={address}
		>
			{label}
		</Link>
	)
}

export declare namespace PoolTokenLink {
	type Props = {
		address: Address.Address
		label: string
	}
}
