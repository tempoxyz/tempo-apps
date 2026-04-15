import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import type * as React from 'react'
import { Addresses } from 'viem/tempo'
import { Amount } from '#comps/Amount'
import { DataGrid } from '#comps/DataGrid'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { getAccountTag } from '#lib/account'
import { isTip20Address } from '#lib/domain/tip20'
import { useMediaQuery } from '#lib/hooks'
import { withLoaderTiming } from '#lib/profiling'
import { feeAmmPoolsQueryOptions, type FeeAmmPool } from '#lib/queries'

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
	]

	const stackedColumns: DataGrid.Column[] = [
		{ label: 'Pool', align: 'start', minWidth: 180 },
		{ label: 'Reserves', align: 'start', minWidth: 200 },
	]

	return (
		<div className="flex flex-col gap-6 px-4 pt-20 pb-16 max-w-[1200px] mx-auto w-full">
			<div className="flex flex-col gap-2">
				<h1 className="text-[32px] leading-none tracking-[-0.02em] font-semibold text-primary">
					Fee AMM
				</h1>
				<p className="text-sm text-secondary max-w-[720px]">
					Discovered Fee AMM pools on{' '}
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
								items={() =>
									pools.map((pool) => ({
										cells: [
											<PoolPairCell key="pool" pool={pool} />,
											<PoolReservesCell key="reserves" pool={pool} />,
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

export function PoolPairCell(props: PoolPairCell.Props): React.JSX.Element {
	const { pool } = props
	const userTokenLabel = getAccountTag(pool.userToken)?.label ?? pool.userToken
	const validatorTokenLabel =
		getAccountTag(pool.validatorToken)?.label ?? pool.validatorToken

	return (
		<div className="inline-flex items-center gap-2 min-w-0">
			<TokenIcon address={pool.userToken} />
			<PoolTokenLink address={pool.userToken} label={userTokenLabel} />
			<span className="text-tertiary">→</span>
			<TokenIcon address={pool.validatorToken} />
			<PoolTokenLink
				address={pool.validatorToken}
				label={validatorTokenLabel}
			/>
		</div>
	)
}

export declare namespace PoolPairCell {
	type Props = {
		pool: FeeAmmPool
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
				short
				maxWidth={14}
			/>
			<Amount
				value={pool.reserveValidatorToken}
				token={pool.validatorToken}
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
