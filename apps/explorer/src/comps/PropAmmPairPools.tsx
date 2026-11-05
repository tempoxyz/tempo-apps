import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	Inline,
	Skeleton,
	Stack,
	StatusIndicator,
	Surface,
	style,
	Table,
	TokenLogo,
} from '@tempoxyz/ds'
import type { Address } from 'viem'
import type * as React from 'react'
import { PriceFormatter } from '#lib/formatting'
import { useRowLink } from '#lib/hooks'
import { propAmmStatus, statusIntent, statusLabels } from '#lib/markets'
import type { PropAmmPool } from '#lib/propamm'
import {
	propAmmPoolsQueryOptions,
	propAmmTradesQueryOptions,
} from '#lib/queries/propamm'

/** Compact above $1K; cents below, so small amounts line up. */
const cents = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
})
const usd = (value: number) =>
	value < 1000
		? cents.format(value)
		: PriceFormatter.format(value, { format: 'short' })
const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const price = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 4,
	maximumFractionDigits: 4,
})

namespace styles {
	export const heading = style({
		color: 'content.primary',
		margin: '0',
		typography: 'heading.h4',
	})
	export const count = style({
		color: 'content.tertiary',
		marginInlineStart: '6',
		fontVariantNumeric: 'tabular-nums !custom',
	})
	export const scroll = style({ overflowX: 'auto', minWidth: '0' })
	export const muted = style({ color: 'content.tertiary' })
	export const secondary = style({ color: 'content.secondary' })
	export const nowrap = style({ whiteSpace: 'nowrap' })
	export const strong = style({ typography: 'body.b2Strong' })
	export const pair = style({
		alignItems: 'center',
		display: 'inline-flex',
		flexShrink: '0 !custom',
		selectors: { '& > :not(:first-child)': { marginInlineStart: '-6' } },
	})
	export const inventory = style({
		alignItems: 'flex-end',
		display: 'flex',
		flexDirection: 'column',
		whiteSpace: 'nowrap',
	})
	export const link = style({
		color: 'inherit !custom',
		textDecoration: 'none !custom',
	})
}

/**
 * PropAMM pools trading the same two tokens as a DEX pair, in either order.
 * Renders nothing until a pool is known to exist, so the pair page is
 * unchanged for pairs PropAMM doesn't serve.
 */
export function PropAmmPairPools(
	props: PropAmmPairPools.Props,
): React.JSX.Element | null {
	const tokens = [props.a.toLowerCase(), props.b.toLowerCase()]
	const pools = useQuery(propAmmPoolsQueryOptions())
	const trades = useQuery(propAmmTradesQueryOptions())
	const rowLink = useRowLink()
	const matches = (pools.data?.pools ?? []).filter(
		(pool) =>
			tokens.includes(pool.base.address.toLowerCase()) &&
			tokens.includes(pool.quote.address.toLowerCase()) &&
			pool.base.address.toLowerCase() !== pool.quote.address.toLowerCase(),
	)
	if (matches.length === 0) return null
	const volume = trades.data?.totals
	const volumeState = trades.isPending
		? 'loading'
		: trades.isError && !trades.data
			? 'unknown'
			: 'known'

	return (
		<Surface size="medium" render={<section aria-label="PropAMM pools" />}>
			<Stack gap="16">
				<h2 {...styles.heading()}>
					PropAMM
					{/* A count of one says nothing. */}
					{matches.length > 1 && (
						<span {...styles.count()}>{matches.length}</span>
					)}
				</h2>
				<div {...styles.scroll()}>
					<Table interactive>
						<Table.Caption>PropAMM pools for this pair</Table.Caption>
						<Table.Head>
							<Table.Row>
								<Table.HeaderCell>Pool</Table.HeaderCell>
								<Table.HeaderCell justify="end">Price</Table.HeaderCell>
								<Table.HeaderCell
									justify="end"
									title="Base and quote held, in US dollars. Pairs on one v2 venue share its balances."
								>
									Inventory
								</Table.HeaderCell>
								<Table.HeaderCell justify="end">1D vol</Table.HeaderCell>
								<Table.HeaderCell justify="end">30D vol</Table.HeaderCell>
								<Table.HeaderCell justify="end">State</Table.HeaderCell>
							</Table.Row>
						</Table.Head>
						<Table.Body>
							{matches.map((pool) => {
								const poolVolume = volume
									? (volume[pool.key]?.volume ?? { day: 0, month: 0 })
									: undefined
								return (
									<Table.Row
										key={pool.key}
										{...rowLink(`/address/${pool.address}`)}
									>
										<Table.Cell>
											<PoolLabel pool={pool} />
										</Table.Cell>
										<Table.Cell justify="end" numeric>
											{pool.price === null ? (
												<span {...styles.muted()}>—</span>
											) : (
												<span {...styles.nowrap()}>
													<span {...styles.secondary()}>
														{price.format(pool.price)}
													</span>{' '}
													<span {...styles.muted()}>{pool.quote.symbol}</span>
												</span>
											)}
										</Table.Cell>
										<Table.Cell justify="end" numeric>
											<Inventory pool={pool} />
										</Table.Cell>
										<Table.Cell justify="end" numeric>
											<Volume state={volumeState} value={poolVolume?.day} />
										</Table.Cell>
										<Table.Cell justify="end" numeric>
											<Volume state={volumeState} value={poolVolume?.month} />
										</Table.Cell>
										<Table.Cell justify="end">
											<State pool={pool} />
										</Table.Cell>
									</Table.Row>
								)
							})}
						</Table.Body>
					</Table>
				</div>
			</Stack>
		</Surface>
	)
}

export declare namespace PropAmmPairPools {
	type Props = {
		/** The pair's two tokens, in either order. */
		a: Address
		b: Address
	}
}

/** The pool's pair and version, linking to the pool's address. */
function PoolLabel(props: { pool: PropAmmPool }): React.JSX.Element {
	const { base, quote, version, address } = props.pool
	return (
		<Link
			to="/address/$address"
			params={{ address }}
			title={`${base.symbol}/${quote.symbol} pool`}
			{...styles.link()}
		>
			<Inline gap="12" render={<span />}>
				<span {...styles.pair()}>
					<TokenLogo src={`/api/token/logo/${base.address}`} alt="" />
					<TokenLogo src={`/api/token/logo/${quote.address}`} alt="" />
				</span>
				<span {...styles.nowrap()}>
					<span {...styles.strong()}>
						{base.symbol}
						<span {...styles.muted()}> / </span>
						{quote.symbol}
					</span>
					<Table.Subtitle>{version}</Table.Subtitle>
				</span>
			</Inline>
		</Link>
	)
}

/** The pool's dollar inventory over its two balances. */
function Inventory(props: { pool: PropAmmPool }): React.JSX.Element {
	const { base, quote, baseBalance, quoteBalance, inventory } = props.pool
	const balance = (value: number | null, symbol: string) => (
		<Table.Subtitle>
			{value === null ? '—' : amount.format(value)} {symbol}
		</Table.Subtitle>
	)
	return (
		<span {...styles.inventory()}>
			{inventory === null ? (
				<span {...styles.muted()}>—</span>
			) : (
				<span>{usd(inventory)}</span>
			)}
			{balance(baseBalance, base.symbol)}
			{balance(quoteBalance, quote.symbol)}
		</span>
	)
}

function Volume(props: {
	state: 'loading' | 'known' | 'unknown'
	value: number | undefined
}): React.JSX.Element {
	if (props.state === 'loading')
		return (
			<Skeleton>
				<span>$0.00M</span>
			</Skeleton>
		)
	if (
		props.state === 'unknown' ||
		props.value === undefined ||
		props.value <= 0
	)
		return <span {...styles.muted()}>—</span>
	return <span>{usd(props.value)}</span>
}

/** A dot in the state's intent and the pool's own word for it. */
function State(props: { pool: PropAmmPool }): React.JSX.Element {
	const { status, detail } = propAmmStatus(props.pool.state)
	return (
		<StatusIndicator intent={statusIntent[status]}>
			{detail ?? statusLabels[status]}
		</StatusIndicator>
	)
}
