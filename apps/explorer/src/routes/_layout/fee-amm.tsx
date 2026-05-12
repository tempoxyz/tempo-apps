import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import { useMemo, useState } from 'react'
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
import { useCopy, useMediaQuery } from '#lib/hooks'
import { withLoaderTiming } from '#lib/profiling'
import { feeAmmPoolsQueryOptions } from '#lib/queries'
import type { FeeAmmPool } from '#lib/server/fee-amm'

type TokenRoute = {
	address: Address.Address
	symbol: string | undefined
	liquidityUsd: number
}

type DirectionalSummary = {
	reserve: bigint
	liquidityUsd: number
	routes: TokenRoute[]
}

type FeeAmmTokenSummary = {
	address: Address.Address
	symbol: string | undefined
	name: string | undefined
	decimals: number | undefined
	totalLiquidityUsd: number
	asFeeToken: DirectionalSummary
	asValidatorToken: DirectionalSummary
}

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
	const tokens = useMemo(() => aggregateTokens(pools), [pools])
	const [activeSection, setActiveSection] = useState(0)

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	const columns: DataGrid.Column[] = [
		{ label: 'Pool', align: 'start', width: '2.5fr', minWidth: 240 },
		{ label: 'Reserves', align: 'start', width: '2.5fr', minWidth: 280 },
		{ label: 'Liquidity', align: 'start', width: 140 },
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
						title: 'Tokens',
						totalItems: `${tokens.length}`,
						itemsLabel: 'tokens',
						autoCollapse: false,
						content: (
							<div className="flex flex-col">
								{tokens.length === 0 ? (
									<div className="px-4 py-8 text-tertiary text-[13px] text-center">
										No fee tokens found.
									</div>
								) : (
									tokens.map((token) => (
										<div
											key={token.address}
											className="flex flex-col gap-3 px-4 py-3 border-b border-dashed border-distinct last:border-b-0"
										>
											<TokenCell
												address={token.address}
												symbol={token.symbol}
												name={token.name}
											/>
											<DirectionalBreakdown token={token} />
										</div>
									))
								)}
							</div>
						),
					},
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
																title={PriceFormatter.format(pool.liquidityUsd)}
															>
																{PriceFormatter.format(pool.liquidityUsd, {
																	format: 'short',
																})}
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
				activeSection={activeSection}
				onSectionChange={setActiveSection}
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
	const { copy, notifying } = useCopy()

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
				<button
					type="button"
					onClick={() => copy(pool.poolId)}
					className={`text-xs font-mono text-left truncate transition-colors ${
						notifying
							? 'text-positive'
							: 'text-tertiary hover:text-accent hover:underline'
					}`}
					title={notifying ? 'Copied pool ID' : 'Copy pool ID'}
				>
					{pool.poolId}
				</button>
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
		<div className="flex flex-col items-start gap-1 min-w-0">
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
		</div>
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

function emptyDirectional() {
	return {
		reserve: 0n,
		liquidityUsd: 0,
		routes: new Map<string, TokenRoute>(),
	}
}

function aggregateTokens(pools: FeeAmmPool[]): FeeAmmTokenSummary[] {
	const map = new Map<
		string,
		{
			address: Address.Address
			symbol: string | undefined
			name: string | undefined
			decimals: number | undefined
			totalLiquidityUsd: number
			asFeeToken: ReturnType<typeof emptyDirectional>
			asValidatorToken: ReturnType<typeof emptyDirectional>
		}
	>()

	function getOrCreate(
		key: string,
		address: Address.Address,
		symbol: string | undefined,
		name: string | undefined,
		decimals: number | undefined,
	) {
		let entry = map.get(key)
		if (!entry) {
			entry = {
				address,
				symbol,
				name,
				decimals,
				totalLiquidityUsd: 0,
				asFeeToken: emptyDirectional(),
				asValidatorToken: emptyDirectional(),
			}
			map.set(key, entry)
		}
		return entry
	}

	for (const pool of pools) {
		const userKey = pool.userToken.toLowerCase()
		const valKey = pool.validatorToken.toLowerCase()

		const userEntry = getOrCreate(
			userKey,
			pool.userToken,
			pool.userTokenSymbol,
			pool.userTokenName,
			pool.userTokenDecimals,
		)
		userEntry.totalLiquidityUsd += pool.liquidityUsd
		userEntry.asFeeToken.reserve += pool.reserveUserToken
		userEntry.asFeeToken.liquidityUsd += pool.liquidityUsd
		const existingFeeRoute = userEntry.asFeeToken.routes.get(valKey)
		userEntry.asFeeToken.routes.set(valKey, {
			address: pool.validatorToken,
			symbol: pool.validatorTokenSymbol,
			liquidityUsd: (existingFeeRoute?.liquidityUsd ?? 0) + pool.liquidityUsd,
		})

		const valEntry = getOrCreate(
			valKey,
			pool.validatorToken,
			pool.validatorTokenSymbol,
			pool.validatorTokenName,
			pool.validatorTokenDecimals,
		)
		valEntry.totalLiquidityUsd += pool.liquidityUsd
		valEntry.asValidatorToken.reserve += pool.reserveValidatorToken
		valEntry.asValidatorToken.liquidityUsd += pool.liquidityUsd
		const existingValRoute = valEntry.asValidatorToken.routes.get(userKey)
		valEntry.asValidatorToken.routes.set(userKey, {
			address: pool.userToken,
			symbol: pool.userTokenSymbol,
			liquidityUsd: (existingValRoute?.liquidityUsd ?? 0) + pool.liquidityUsd,
		})
	}

	return Array.from(map.values())
		.map((entry) => ({
			address: entry.address,
			symbol: entry.symbol,
			name: entry.name,
			decimals: entry.decimals,
			totalLiquidityUsd: entry.totalLiquidityUsd,
			asFeeToken: {
				reserve: entry.asFeeToken.reserve,
				liquidityUsd: entry.asFeeToken.liquidityUsd,
				routes: Array.from(entry.asFeeToken.routes.values()).sort(
					(a, b) => b.liquidityUsd - a.liquidityUsd,
				),
			},
			asValidatorToken: {
				reserve: entry.asValidatorToken.reserve,
				liquidityUsd: entry.asValidatorToken.liquidityUsd,
				routes: Array.from(entry.asValidatorToken.routes.values()).sort(
					(a, b) => b.liquidityUsd - a.liquidityUsd,
				),
			},
		}))
		.sort((a, b) => b.totalLiquidityUsd - a.totalLiquidityUsd)
}

function TokenCell(props: {
	address: Address.Address
	symbol: string | undefined
	name: string | undefined
}): React.JSX.Element {
	const { address, symbol, name } = props
	const to = isTip20Address(address) ? '/token/$address' : '/address/$address'

	return (
		<div className="inline-flex items-center gap-2 min-w-0">
			<TokenIcon address={address} />
			<Link
				to={to}
				params={{ address }}
				className="text-accent hover:underline truncate"
				title={address}
			>
				{symbol ?? name ?? address}
			</Link>
		</div>
	)
}

function DirectionalBreakdown(props: {
	token: FeeAmmTokenSummary
}): React.JSX.Element {
	const { token } = props

	return (
		<div className="flex flex-col gap-3">
			<DirectionalRow
				label="As Fee Token"
				reserve={token.asFeeToken.reserve}
				tokenAddress={token.address}
				decimals={token.decimals}
				symbol={token.symbol}
				liquidityUsd={token.asFeeToken.liquidityUsd}
				routes={token.asFeeToken.routes}
			/>
			<DirectionalRow
				label="As Validator Token"
				reserve={token.asValidatorToken.reserve}
				tokenAddress={token.address}
				decimals={token.decimals}
				symbol={token.symbol}
				liquidityUsd={token.asValidatorToken.liquidityUsd}
				routes={token.asValidatorToken.routes}
			/>
		</div>
	)
}

function DirectionalRow(props: {
	label: string
	reserve: bigint
	tokenAddress: Address.Address
	decimals: number | undefined
	symbol: string | undefined
	liquidityUsd: number
	routes: TokenRoute[]
}): React.JSX.Element {
	const {
		label,
		reserve,
		tokenAddress,
		decimals,
		symbol,
		liquidityUsd,
		routes,
	} = props
	const hasActivity = routes.length > 0

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-dashed border-distinct px-3 py-2.5">
			<span className="text-xs font-medium text-primary">{label}</span>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
				{hasActivity ? (
					<>
						<div className="flex flex-col gap-0.5 min-w-[140px]">
							<span className="text-[11px] text-tertiary">Reserves</span>
							<Amount
								value={reserve}
								token={tokenAddress}
								decimals={decimals}
								symbol={symbol}
								short
								maxWidth={14}
							/>
						</div>
						<div className="flex flex-col gap-0.5 min-w-[100px]">
							<span className="text-[11px] text-tertiary">Liquidity</span>
							<span
								className="text-secondary tabular-nums text-[13px] font-mono"
								title={PriceFormatter.format(liquidityUsd)}
							>
								{PriceFormatter.format(liquidityUsd, { format: 'short' })}
							</span>
						</div>
						<div className="flex flex-col gap-0.5 min-w-0 flex-1">
							<span className="text-[11px] text-tertiary">Routes</span>
							<RoutesCell routes={routes} />
						</div>
					</>
				) : (
					<>
						<div className="min-w-[140px]" />
						<div className="min-w-[100px]">
							<span className="text-xs text-tertiary">No pools</span>
						</div>
					</>
				)}
			</div>
		</div>
	)
}

const MAX_VISIBLE_ROUTES = 5

function RoutesCell(props: { routes: TokenRoute[] }): React.JSX.Element {
	const { routes } = props
	const visible = routes.slice(0, MAX_VISIBLE_ROUTES)
	const overflow = routes.length - MAX_VISIBLE_ROUTES

	return (
		<div className="flex flex-wrap items-center gap-y-1">
			{visible.map((route, i) => {
				const to = isTip20Address(route.address)
					? '/token/$address'
					: '/address/$address'
				const isLast = i === visible.length - 1 && overflow <= 0
				return (
					<span
						key={route.address}
						className="inline-flex items-center gap-1 mr-1"
					>
						<TokenIcon address={route.address} className="size-4" />
						<Link
							to={to}
							params={{ address: route.address }}
							className="text-accent hover:underline text-sm"
							title={route.address}
						>
							{route.symbol ?? route.address}
						</Link>
						{!isLast && <span className="text-tertiary ml-1">·</span>}
					</span>
				)
			})}
			{overflow > 0 && (
				<span className="text-tertiary text-sm">+ {overflow} more</span>
			)}
		</div>
	)
}
