import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Callout, Rows, style } from '@tempoxyz/ds'
import { ArrowRight } from '@tempoxyz/ds/icons'
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
			<Callout
				intent={query.data ? 'warning' : 'negative'}
				role="alert"
				size="small"
			>
				<Callout.Icon />
				<Callout.Content>
					{query.data
						? 'Could not refresh liquidity. Showing the last successful result.'
						: 'Fee AMM liquidity is temporarily unavailable.'}
				</Callout.Content>
				<Callout.Action
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
				>
					{query.isFetching ? 'Retrying…' : 'Try again'}
				</Callout.Action>
			</Callout>
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
			<Rows dividers="full" size="small">
				<Rows.Row spacing="none">
					<Rows.Label>Fee-token reserve</Rows.Label>
					<span {...styles.value()}>
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
					</span>
				</Rows.Row>
				<Rows.Row spacing="none">
					<Rows.Label>Validator-token reserve</Rows.Label>
					<span {...styles.value()}>
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
					</span>
				</Rows.Row>
				<Rows.Row spacing="none">
					<Rows.Label>Estimated liquidity</Rows.Label>
					<span {...styles.value()}>
						{pool.liquidityUsd === null
							? 'Unavailable'
							: PriceFormatter.format(pool.liquidityUsd)}
					</span>
				</Rows.Row>
				<Rows.Row spacing="none">
					<Rows.Label>Last liquidity added</Rows.Label>
					<span {...styles.lastAdded()}>
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
					</span>
				</Rows.Row>
			</Rows>
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

namespace styles {
	export const loading = style({
		color: 'gray.900',
		paddingBlock: '32',
		paddingInline: '16',
		typography: 'copy.14',
	})

	export const alert = style({ padding: '16' })

	export const row = style({
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'dashed',
		display: 'grid',
		gap: '16',
		paddingBlock: '16',
		paddingInline: '16',
		':last-child': { borderBottomWidth: '0px' },
		'@media (width >= 768px)': {
			gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)',
		},
	})

	export const pair = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		minWidth: '0',
	})

	export const tokens = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		typography: 'copy.14',
	})

	export const pairArrow = style({ color: 'gray.700', flexShrink: 0 })

	export const caption = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	export const value = style({
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0',
		overflowWrap: 'anywhere',
		textAlign: 'end',
	})

	export const lastAdded = style({ minWidth: '0', textAlign: 'end' })

	export const deposits = style({
		color: 'gray.900',
		display: 'block',
		typography: 'label.12',
	})

	export const tokenLink = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
	})

	export const section = style({
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'dashed',
		scrollMarginTop: '80',
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
		color: 'foreground',
		typography: 'copy.14.strong',
	})

	export const viewAll = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
		typography: 'copy.14',
	})

	export const empty = style({
		color: 'gray.900',
		paddingBottom: '20',
		paddingInline: '16',
		typography: 'copy.14',
	})

	export const more = style({
		color: 'gray.900',
		paddingBottom: '12',
		paddingInline: '16',
		typography: 'label.12',
	})
}
