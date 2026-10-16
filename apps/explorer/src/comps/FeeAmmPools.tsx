import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Alert, SimpleTable, style } from '@tempoxyz/ds/platform'
import { ArrowRight } from '@tempoxyz/ds/platform/icons'
import type { Address } from 'ox'
import type * as React from 'react'
import { cx } from 'zyzz'
import { Amount } from '#comps/Amount'
import { CopyButton } from '#comps/CopyButton'
import { TokenIcon } from '#comps/TokenIcon'
import { FormattedTimestamp } from '#comps/TimeFormat'
import { PriceFormatter } from '#lib/formatting'
import { feeAmmPoolsQueryOptions } from '#lib/queries/fee-amm'
import type { FeeAmmPage, FeeAmmPool } from '#lib/server/fee-amm'
import { link, linkHover } from '#styles/explorer'

export function FeeAmmQueryState({
	query,
}: FeeAmmQueryState.Props): React.JSX.Element | null {
	if (query.isPending)
		return (
			<p role="status" {...styles.loading()}>
				Loading Fee AMM liquidity…
			</p>
		)
	if (!query.isError) return null
	return (
		<div {...styles.alert()}>
			<Alert
				role="alert"
				tone={query.data ? 'warning' : 'negative'}
				title={
					query.data
						? 'Could not refresh liquidity. Showing the last successful result.'
						: 'Fee AMM liquidity is temporarily unavailable.'
				}
				action={{
					disabled: query.isFetching,
					label: query.isFetching ? 'Retrying…' : 'Try again',
					onClick: () => void query.refetch(),
				}}
			/>
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
		<div {...styles.row()}>
			<div {...styles.pair()}>
				<div {...styles.tokens()}>
					<PoolTokenLink
						address={pool.userToken}
						symbol={pool.userTokenSymbol}
					/>
					<ArrowRight {...styles.pairArrow()} aria-label="converts fees to" />
					<PoolTokenLink
						address={pool.validatorToken}
						symbol={pool.validatorTokenSymbol}
					/>
					<CopyButton value={pool.poolId} ariaLabel="Copy pool ID" />
				</div>
				<p {...styles.caption()}>
					{token
						? pool.userToken.toLowerCase() === token.toLowerCase()
							? 'Used to pay fees'
							: 'Received by validators'
						: 'Fee token → Validator token'}
				</p>
			</div>
			<SimpleTable>
				<SimpleTable.Row style={compactRow}>
					<SimpleTable.Dt>Fee-token reserve</SimpleTable.Dt>
					<SimpleTable.Dd {...styles.value()}>
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
					</SimpleTable.Dd>
				</SimpleTable.Row>
				<SimpleTable.Row style={compactRow}>
					<SimpleTable.Dt>Validator-token reserve</SimpleTable.Dt>
					<SimpleTable.Dd {...styles.value()}>
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
					</SimpleTable.Dd>
				</SimpleTable.Row>
				<SimpleTable.Row style={compactRow}>
					<SimpleTable.Dt>Estimated liquidity</SimpleTable.Dt>
					<SimpleTable.Dd {...styles.value()}>
						{pool.liquidityUsd === null
							? 'Unavailable'
							: PriceFormatter.format(pool.liquidityUsd)}
					</SimpleTable.Dd>
				</SimpleTable.Row>
				<SimpleTable.Row style={compactRow}>
					<SimpleTable.Dt>Last liquidity added</SimpleTable.Dt>
					<SimpleTable.Dd>
						{pool.latestMintAt === null ? (
							'Unknown'
						) : (
							<FormattedTimestamp
								timestamp={BigInt(pool.latestMintAt)}
								format="relative"
							/>
						)}
						<span {...styles.deposits()}>
							{pool.mintCount.toLocaleString()} liquidity{' '}
							{pool.mintCount === 1 ? 'deposit' : 'deposits'}
						</span>
					</SimpleTable.Dd>
				</SimpleTable.Row>
			</SimpleTable>
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
			aria-label={`View ${symbol} Fee AMM liquidity`}
			{...cx(styles.tokenLink(), link(), linkHover())}
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
		<section aria-label="Fee AMM liquidity" {...styles.section()}>
			<div {...styles.sectionHeader()}>
				<div>
					<h2 {...styles.sectionTitle()}>Fee AMM liquidity</h2>
					<p {...styles.caption()}>
						Pools that use this token to pay or receive transaction fees.
					</p>
				</div>
				<Link
					to="/fee-amm"
					search={{ token: address, page: 1, limit: 10 }}
					{...cx(styles.viewAll(), link(), linkHover())}
				>
					View all pools <ArrowRight />
				</Link>
			</div>
			<FeeAmmQueryState query={query} />
			{query.data && (
				<FeeAmmPoolList pools={query.data.pools.slice(0, 3)} token={address} />
			)}
			{query.data?.pools.length === 0 && !query.isError && (
				<p {...styles.empty()}>No Fee AMM pools found for this token.</p>
			)}
			{query.data && query.data.pools.length > 3 && (
				<p {...styles.more()}>
					Showing the 3 most active pools. View all pools for more.
				</p>
			)}
		</section>
	)
}

export declare namespace TokenFeeAmm {
	type Props = { address: Address.Address }
}

// Pool rows list many values, so their table rows are compact.
const compactRow = { paddingBlock: 8 } satisfies React.CSSProperties

namespace styles {
	export const loading = style({
		color: 'content.secondary',
		paddingBlock: '32',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const alert = style({ padding: '16' })

	export const row = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'dashed',
		display: 'grid',
		gap: '16',
		paddingBlock: '16',
		paddingInline: '16',
		':last-child': { borderBottomWidth: 'none' },
		'@media (width >= 768px)': {
			gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)',
		},
	})

	export const pair = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		minWidth: '0px !custom',
	})

	export const tokens = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		typography: 'body.b2',
	})

	export const pairArrow = style({ color: 'content.tertiary', flexShrink: 0 })

	export const caption = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})

	export const value = style({ fontVariantNumeric: 'tabular-nums' })

	export const deposits = style({
		color: 'content.secondary',
		display: 'block',
		typography: 'body.b3',
	})

	export const tokenLink = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
	})

	export const section = style({
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'dashed',
		scrollMarginTop: '80px !custom',
	})

	export const sectionHeader = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '12',
		justifyContent: 'space-between',
		padding: '16',
	})

	export const sectionTitle = style({
		color: 'content.primary',
		typography: 'body.b2Strong',
	})

	export const viewAll = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
		typography: 'body.b2',
	})

	export const empty = style({
		color: 'content.secondary',
		paddingBottom: '20',
		paddingInline: '16',
		typography: 'body.b2',
	})

	export const more = style({
		color: 'content.secondary',
		paddingBottom: '12',
		paddingInline: '16',
		typography: 'body.b3',
	})
}
