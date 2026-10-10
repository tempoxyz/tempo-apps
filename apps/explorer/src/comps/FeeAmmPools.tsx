import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import * as React from 'react'
import { Amount } from '#comps/Amount'
import { CopyButton } from '#comps/CopyButton'
import { TokenIcon } from '#comps/TokenIcon'
import { FormattedTimestamp } from '#comps/TimeFormat'
import { cx } from '#lib/css'
import { PriceFormatter } from '#lib/formatting'
import { feeAmmPoolsQueryOptions } from '#lib/queries/fee-amm'
import type { FeeAmmPage, FeeAmmPool } from '#lib/server/fee-amm'
import ArrowRightIcon from '~icons/lucide/arrow-right'
import ChevronDownIcon from '~icons/lucide/chevron-down'

export function FeeAmmQueryState({
	query,
}: FeeAmmQueryState.Props): React.JSX.Element | null {
	if (query.isPending)
		return (
			<p role="status" className="px-4 py-8 type-card text-tertiary">
				Loading Fee AMM liquidity…
			</p>
		)
	if (!query.isError) return null
	return (
		<div
			role="alert"
			className="flex flex-wrap items-center gap-3 px-4 py-6 type-card"
		>
			<p className="text-secondary">
				{query.data
					? 'Could not refresh liquidity. Showing the last successful result.'
					: 'Fee AMM liquidity is temporarily unavailable.'}
			</p>
			<button
				type="button"
				onClick={() => void query.refetch()}
				disabled={query.isFetching}
				className="text-accent hover:underline disabled:opacity-50"
			>
				{query.isFetching ? 'Retrying…' : 'Try again'}
			</button>
		</div>
	)
}

export declare namespace FeeAmmQueryState {
	type Props = { query: UseQueryResult<FeeAmmPage, Error> }
}

export function FeeAmmPoolList({
	pools,
	token,
}: FeeAmmPoolList.Props): React.JSX.Element {
	return (
		<div>
			{pools.map((pool) => (
				<PoolRow key={pool.poolId} pool={pool} token={token} />
			))}
		</div>
	)
}

export declare namespace FeeAmmPoolList {
	type Props = { pools: FeeAmmPool[]; token?: Address.Address | undefined }
}

export function PoolRow({ pool, token }: PoolRow.Props): React.JSX.Element {
	return (
		<div className="grid grid-cols-2 md:grid-cols-[1.6fr_1.5fr_1fr_1fr] gap-4 px-4 py-3 border-b border-dashed border-card-border last:border-b-0 type-card">
			<div className="col-span-2 md:col-span-1 flex flex-col gap-2 min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<PoolTokenLink
						address={pool.userToken}
						symbol={pool.userTokenSymbol}
					/>
					<ArrowRightIcon
						className="size-3.5 text-tertiary"
						aria-label="converts fees to"
					/>
					<PoolTokenLink
						address={pool.validatorToken}
						symbol={pool.validatorTokenSymbol}
					/>
					<CopyButton value={pool.poolId} ariaLabel="Copy pool ID" />
				</div>
				<p className="label-12 text-secondary">
					{token
						? pool.userToken.toLowerCase() === token.toLowerCase()
							? 'Used to pay fees'
							: 'Received by validators'
						: 'Fee token → Validator token'}
				</p>
			</div>
			<div className="col-span-2 md:col-span-1">
				<PoolReserves pool={pool} />
			</div>
			<dl className="flex flex-col gap-1">
				<dt className="label-12 text-tertiary">Estimated liquidity</dt>
				<dd className="type-card-data tabular-nums text-primary">
					{pool.liquidityUsd === null
						? 'Unavailable'
						: PriceFormatter.format(pool.liquidityUsd)}
				</dd>
			</dl>
			<dl className="flex flex-col gap-1">
				<dt className="label-12 text-tertiary">Last liquidity added</dt>
				<dd className="text-primary">
					{pool.latestMintAt === null ? (
						'Unknown'
					) : (
						<FormattedTimestamp
							timestamp={BigInt(pool.latestMintAt)}
							format="relative"
						/>
					)}
				</dd>
				<dd className="label-12 text-tertiary">
					{pool.mintCount.toLocaleString()} liquidity{' '}
					{pool.mintCount === 1 ? 'deposit' : 'deposits'}
				</dd>
			</dl>
		</div>
	)
}

export declare namespace PoolRow {
	type Props = { pool: FeeAmmPool; token?: Address.Address | undefined }
}

export function PoolTokenLink({
	address,
	symbol,
}: PoolTokenLink.Props): React.JSX.Element {
	return (
		<Link
			to="/fee-amm"
			search={{ token: address, page: 1, limit: 10 }}
			title={`View ${symbol} Fee AMM liquidity`}
			className="inline-flex items-center gap-1 text-accent hover:underline"
		>
			<TokenIcon address={address} />
			{symbol}
		</Link>
	)
}

export declare namespace PoolTokenLink {
	type Props = { address: Address.Address; symbol: string }
}

export function TokenFeeAmm({ address }: TokenFeeAmm.Props): React.JSX.Element {
	const query = useQuery(
		feeAmmPoolsQueryOptions({ token: address, page: 1, limit: 10 }),
	)
	return (
		<section
			aria-label="Fee AMM liquidity"
			className="border-y border-distinct scroll-mt-20 pb-2"
		>
			<div className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-5">
				<div>
					<h2 className="heading-16 text-primary">Fee AMM liquidity</h2>
					<p className="label-12 text-secondary">
						Pools that use this token to pay or receive transaction fees.
					</p>
				</div>
				<Link
					to="/fee-amm"
					search={{ token: address, page: 1, limit: 10 }}
					className="type-card text-accent hover:underline inline-flex items-center gap-1"
				>
					View all pools <ArrowRightIcon className="size-3.5" />
				</Link>
			</div>
			<FeeAmmQueryState query={query} />
			{query.data && (
				<TokenPoolTable pools={query.data.pools.slice(0, 3)} token={address} />
			)}
			{query.data?.pools.length === 0 && !query.isError && (
				<p className="px-4 pb-5 copy-14 text-secondary">
					No Fee AMM pools found for this token.
				</p>
			)}
			{query.data && query.data.pools.length > 3 && (
				<p className="px-4 pb-3 label-12 text-tertiary">
					Showing the 3 most active pools. View all pools for more.
				</p>
			)}
		</section>
	)
}

export declare namespace TokenFeeAmm {
	type Props = { address: Address.Address }
}

function PoolReserves({
	pool,
	compact = false,
}: {
	pool: FeeAmmPool
	compact?: boolean
}): React.JSX.Element {
	return (
		<dl
			className={cx(
				'min-w-0',
				compact
					? 'grid grid-cols-1 sm:grid-cols-2 gap-4'
					: 'grid grid-cols-2 md:flex md:flex-col gap-2',
			)}
		>
			<div>
				<dt className="label-12 text-tertiary">Fee-token reserve</dt>
				<dd className="text-primary type-card-data tabular-nums">
					{pool.reserveUserToken === null ? (
						'Unavailable'
					) : (
						<Amount
							value={pool.reserveUserToken}
							token={pool.userToken}
							decimals={pool.userTokenDecimals}
							symbol={pool.userTokenSymbol}
						/>
					)}
				</dd>
			</div>
			<div>
				<dt className="label-12 text-tertiary">Validator-token reserve</dt>
				<dd className="text-primary type-card-data tabular-nums">
					{pool.reserveValidatorToken === null ? (
						'Unavailable'
					) : (
						<Amount
							value={pool.reserveValidatorToken}
							token={pool.validatorToken}
							decimals={pool.validatorTokenDecimals}
							symbol={pool.validatorTokenSymbol}
						/>
					)}
				</dd>
			</div>
		</dl>
	)
}

function TokenPoolTable(props: FeeAmmPoolList.Props): React.JSX.Element {
	return (
		<table className="w-full table-fixed text-left copy-13">
			<caption className="sr-only">Fee AMM pools for this token</caption>
			<thead className="label-12 text-secondary border-b border-distinct">
				<tr>
					<th scope="col" className="w-[46%] pl-[18px] pr-2 pb-3 font-normal">
						Pool
					</th>
					<th scope="col" className="w-[25%] px-2 pb-3 font-normal">
						Estimated liquidity
					</th>
					<th scope="col" className="pl-2 pr-[18px] pb-3 font-normal">
						Last deposit
					</th>
				</tr>
			</thead>
			<tbody>
				{props.pools.map((pool) => (
					<TokenPoolRow key={pool.poolId} pool={pool} token={props.token} />
				))}
			</tbody>
		</table>
	)
}

function TokenPoolRow({ pool, token }: PoolRow.Props): React.JSX.Element {
	const [expanded, setExpanded] = React.useState(false)
	const id = React.useId()
	return (
		<>
			<tr className="border-b border-distinct last:border-0 align-top">
				<th scope="row" className="pl-[18px] pr-2 py-3 font-normal">
					<div className="flex flex-wrap items-center gap-1.5 min-w-0 wrap-anywhere">
						<PoolTokenLink
							address={pool.userToken}
							symbol={pool.userTokenSymbol}
						/>
						<ArrowRightIcon
							className="size-3 text-tertiary"
							aria-label="converts fees to"
						/>
						<PoolTokenLink
							address={pool.validatorToken}
							symbol={pool.validatorTokenSymbol}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
						<p className="label-12 text-secondary">
							{pool.userToken.toLowerCase() === token?.toLowerCase()
								? 'Used to pay fees'
								: 'Received by validators'}
						</p>
						<button
							type="button"
							aria-expanded={expanded}
							aria-controls={id}
							aria-label={`${expanded ? 'Hide' : 'Show'} ${pool.userTokenSymbol} to ${pool.validatorTokenSymbol} pool details`}
							onClick={() => setExpanded(!expanded)}
							className="inline-flex items-center gap-1 text-secondary hover:text-primary label-12 cursor-pointer"
						>
							Details{' '}
							<ChevronDownIcon
								className={expanded ? 'size-3 rotate-180' : 'size-3'}
							/>
						</button>
					</div>
				</th>
				<td className="px-2 py-3 tabular-nums wrap-anywhere">
					{pool.liquidityUsd === null
						? 'Unavailable'
						: PriceFormatter.format(pool.liquidityUsd)}
				</td>
				<td className="pl-2 pr-[18px] py-3 wrap-anywhere">
					{pool.latestMintAt === null ? (
						'Unknown'
					) : (
						<FormattedTimestamp
							timestamp={BigInt(pool.latestMintAt)}
							format="relative"
						/>
					)}
				</td>
			</tr>
			<tr
				id={id}
				hidden={!expanded}
				className="border-b border-distinct last:border-0"
			>
				<td colSpan={3} className="px-[18px] py-4 bg-base-alt/50">
					<PoolReserves pool={pool} compact />
					<p className="label-12 text-secondary mt-3">
						{pool.mintCount.toLocaleString()} liquidity{' '}
						{pool.mintCount === 1 ? 'deposit' : 'deposits'}
					</p>
					<div className="flex items-start gap-2 mt-2 label-12 text-tertiary">
						<span className="shrink-0">Pool ID</span>
						<span className="font-mono break-all min-w-0">{pool.poolId}</span>
						<CopyButton value={pool.poolId} ariaLabel="Copy pool ID" />
					</div>
				</td>
			</tr>
		</>
	)
}
