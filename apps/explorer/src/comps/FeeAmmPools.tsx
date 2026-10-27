import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	Amount,
	Callout,
	CopyButton,
	Empty,
	Rows,
	Spinner,
	Table,
	Token,
	style,
} from '@tempoxyz/ds'
import { ArrowRight } from '@tempoxyz/ds/icons'
import type { Address } from 'ox'
import type * as React from 'react'
import { formatUnits } from 'viem'
import { cx } from 'zyzz'
import { FormattedTimestamp } from '#comps/TimeFormat'
import { feeAmmPoolsQueryOptions } from '#lib/queries/fee-amm'
import type { FeeAmmPage, FeeAmmPool } from '#lib/server/fee-amm'
import { link, linkHover } from '#styles/explorer'

export function FeeAmmQueryState({
	query,
}: FeeAmmQueryState.Props): React.JSX.Element | null {
	if (query.isPending)
		return (
			<div aria-busy {...styles.loading()}>
				<Spinner aria-label="Loading Fee AMM liquidity" />
			</div>
		)
	if (!query.isError) return null
	return (
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
	)
}

export declare namespace FeeAmmQueryState {
	type Props = { query: UseQueryResult<FeeAmmPage, Error> }
}

/** No pools to list, in place of the pool table. */
export function FeeAmmEmpty(props: FeeAmmEmpty.Props): React.JSX.Element {
	return (
		<Empty.Root>
			<Empty.Title>{props.title}</Empty.Title>
			<Empty.Description>{props.description}</Empty.Description>
		</Empty.Root>
	)
}

export declare namespace FeeAmmEmpty {
	type Props = { description: string; title: string }
}

/**
 * Pools as a TDS Table, or as stacked rows when the container is narrower
 * than 800px, where five columns no longer fit (TDS Tables and Lists, Below 640px).
 */
export function FeeAmmPoolList({
	pools,
	token,
}: FeeAmmPoolList.Props): React.JSX.Element {
	return (
		<div {...styles.list()}>
			{/* Both layouts render; `display: none` keeps only the visible one in the accessibility tree. */}
			<div {...styles.wide()}>
				<Table.Root aria-label="Fee AMM pools" size="small">
					<Table.Head>
						<Table.Row>
							<Table.HeaderCell>Pool</Table.HeaderCell>
							<Table.HeaderCell justify="end">
								Fee-token reserve
							</Table.HeaderCell>
							<Table.HeaderCell justify="end">
								Validator-token reserve
							</Table.HeaderCell>
							<Table.HeaderCell justify="end">Liquidity</Table.HeaderCell>
							<Table.HeaderCell justify="end">Last deposit</Table.HeaderCell>
						</Table.Row>
					</Table.Head>
					<Table.Body>
						{pools.map((pool) => (
							<Table.Row key={pool.poolId}>
								<Table.Cell>
									<PoolPair pool={pool} token={token} />
								</Table.Cell>
								<Table.Cell justify="end" numeric>
									<Reserve
										decimals={pool.userTokenDecimals}
										symbol={pool.userTokenSymbol}
										value={pool.reserveUserToken}
									/>
								</Table.Cell>
								<Table.Cell justify="end" numeric>
									<Reserve
										decimals={pool.validatorTokenDecimals}
										symbol={pool.validatorTokenSymbol}
										value={pool.reserveValidatorToken}
									/>
								</Table.Cell>
								<Table.Cell justify="end" numeric>
									<Liquidity pool={pool} />
								</Table.Cell>
								<Table.Cell justify="end">
									<LastDeposit pool={pool} />
								</Table.Cell>
							</Table.Row>
						))}
					</Table.Body>
				</Table.Root>
			</div>
			<div {...styles.narrow()}>
				<Rows aria-label="Fee AMM pools" dividers="full" role="list">
					{pools.map((pool) => (
						<Rows.Row key={pool.poolId} role="listitem" spacing="none">
							<Rows.Info>
								<Rows.Title>
									<PoolPair pool={pool} token={token} />
								</Rows.Title>
								<Rows.Description>
									<span {...styles.reserves()}>
										<Reserve
											decimals={pool.userTokenDecimals}
											symbol={pool.userTokenSymbol}
											value={pool.reserveUserToken}
										/>
										<Reserve
											decimals={pool.validatorTokenDecimals}
											symbol={pool.validatorTokenSymbol}
											value={pool.reserveValidatorToken}
										/>
									</span>
								</Rows.Description>
							</Rows.Info>
							<span {...styles.end()}>
								<Liquidity pool={pool} />
								<LastDeposit pool={pool} />
							</span>
						</Rows.Row>
					))}
				</Rows>
			</div>
		</div>
	)
}

export declare namespace FeeAmmPoolList {
	type Props = { pools: FeeAmmPool[]; token?: Address.Address | undefined }
}

/** The fee token and validator token, each linking to its pools. */
function PoolPair(props: {
	pool: FeeAmmPool
	token?: Address.Address | undefined
}): React.JSX.Element {
	const { pool, token } = props
	return (
		<span {...styles.pair()}>
			<span {...styles.tokens()}>
				<PoolTokenLink address={pool.userToken} symbol={pool.userTokenSymbol} />
				<ArrowRight {...styles.pairArrow()} aria-label="converts fees to" />
				<PoolTokenLink
					address={pool.validatorToken}
					symbol={pool.validatorTokenSymbol}
				/>
				<CopyButton aria-label="Copy pool ID" value={pool.poolId} />
			</span>
			{token && (
				<span {...styles.caption()}>
					{pool.userToken.toLowerCase() === token.toLowerCase()
						? 'Used to pay fees'
						: 'Received by validators'}
				</span>
			)}
		</span>
	)
}

function Reserve(props: {
	decimals: number
	symbol: string
	value: bigint | null
}): React.JSX.Element {
	if (props.value === null)
		return <span {...styles.missing()}>Unavailable</span>
	return (
		<span {...styles.amount()}>
			<Amount
				align="right"
				symbol={props.symbol}
				value={formatUnits(props.value, props.decimals)}
			/>
		</span>
	)
}

function Liquidity(props: { pool: FeeAmmPool }): React.JSX.Element {
	if (props.pool.liquidityUsd === null)
		return <span {...styles.missing()}>Unavailable</span>
	return <Amount align="right" currency="USD" value={props.pool.liquidityUsd} />
}

function LastDeposit(props: { pool: FeeAmmPool }): React.JSX.Element {
	const { pool } = props
	return (
		<span {...styles.lastDeposit()}>
			{pool.latestMintAt === null ? (
				'Never'
			) : (
				<FormattedTimestamp
					timestamp={BigInt(pool.latestMintAt)}
					format="relative"
				/>
			)}
			<span {...styles.caption()}>
				{pool.mintCount.toLocaleString()}{' '}
				{pool.mintCount === 1 ? 'deposit' : 'deposits'}
			</span>
		</span>
	)
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
			<Token address={address} size="small" />
			{symbol}
		</Link>
	)
}

export declare namespace PoolTokenLink {
	type Props = { address: Address.Address; symbol: string }
}

/** The three most active pools of one token. */
export function TokenFeeAmm({ address }: TokenFeeAmm.Props): React.JSX.Element {
	const query = useQuery(
		feeAmmPoolsQueryOptions({ token: address, page: 1, limit: 10 }),
	)
	return (
		<>
			<FeeAmmQueryState query={query} />
			{query.data && query.data.pools.length > 0 && (
				<FeeAmmPoolList pools={query.data.pools.slice(0, 3)} token={address} />
			)}
			{query.data?.pools.length === 0 && !query.isError && (
				<FeeAmmEmpty
					title="No Fee AMM pools for this token"
					description="Pools appear here once liquidity is added for this token."
				/>
			)}
			{query.data && query.data.pools.length > 3 && (
				<p {...styles.more()}>
					Showing the 3 most active pools. View all pools for the rest.
				</p>
			)}
		</>
	)
}

export declare namespace TokenFeeAmm {
	type Props = { address: Address.Address }
}

namespace styles {
	export const loading = style({
		display: 'flex',
		justifyContent: 'center',
		paddingBlock: '32',
	})

	export const list = style({ containerType: 'inline-size' })

	export const wide = style({
		display: 'none',
		overflowX: 'auto',
		'@container (width >= 800px)': { display: 'block' },
	})

	export const narrow = style({
		'@container (width >= 800px)': { display: 'none' },
	})

	export const pair = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		minWidth: '0',
	})

	export const tokens = style({
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'nowrap',
		gap: '4',
	})

	export const pairArrow = style({ color: 'gray.900', flexShrink: 0 })

	export const caption = style({
		color: 'gray.900',
		typography: 'label.13',
	})

	export const missing = style({ color: 'gray.900' })

	// An amount keeps its symbol on its line.
	export const amount = style({ whiteSpace: 'nowrap' })

	export const reserves = style({
		columnGap: '8',
		display: 'flex',
		flexWrap: 'wrap',
	})

	export const end = style({
		alignItems: 'flex-end',
		display: 'flex',
		flexDirection: 'column',
		flexShrink: 0,
		gap: '4',
	})

	export const lastDeposit = style({
		alignItems: 'flex-end',
		display: 'flex',
		flexDirection: 'column',
		whiteSpace: 'nowrap',
	})

	export const tokenLink = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
		whiteSpace: 'nowrap',
	})

	export const more = style({
		color: 'gray.900',
		paddingTop: '8',
		typography: 'label.13',
	})
}
