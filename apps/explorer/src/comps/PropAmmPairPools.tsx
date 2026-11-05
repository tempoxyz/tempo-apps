import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	formatHex,
	Skeleton,
	Stack,
	StatusIndicator,
	Surface,
	style,
	Table,
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

const usd = (value: number) => PriceFormatter.format(value, { format: 'short' })
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
	export const lede = style({
		color: 'content.secondary',
		margin: '0',
		typography: 'body.b2',
	})
	export const scroll = style({ overflowX: 'auto', minWidth: '0' })
	export const muted = style({ color: 'content.tertiary' })
	export const mono = style({ typography: 'mono.m1', whiteSpace: 'nowrap' })
	export const nowrap = style({ whiteSpace: 'nowrap' })
	export const strong = style({ typography: 'body.b2Strong' })
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
	const volumeFailed = trades.isError && !trades.data

	return (
		<Surface size="medium" render={<section aria-label="PropAMM pools" />}>
			<Stack gap="16">
				<Stack gap="4">
					<h2 {...styles.heading()}>PropAMM</h2>
					<p {...styles.lede()}>
						{matches.length === 1 ? 'A pool' : 'Pools'} where a market maker
						trades this pair from its own inventory with approved takers.
					</p>
				</Stack>
				<div {...styles.scroll()}>
					<Table interactive>
						<Table.Caption>PropAMM pools for this pair</Table.Caption>
						<Table.Head>
							<Table.Row>
								<Table.HeaderCell>Pool</Table.HeaderCell>
								<Table.HeaderCell justify="end">Price</Table.HeaderCell>
								<Table.HeaderCell
									justify="end"
									title="Base and quote held. Pairs on one v2 venue share its balances."
								>
									Inventory
								</Table.HeaderCell>
								<Table.HeaderCell justify="end">1D vol</Table.HeaderCell>
								<Table.HeaderCell justify="end">30D vol</Table.HeaderCell>
								<Table.HeaderCell justify="start">State</Table.HeaderCell>
							</Table.Row>
						</Table.Head>
						<Table.Body>
							{matches.map((pool) => {
								const poolVolume = volume
									? (volume[pool.key]?.volume ?? { day: 0, month: 0 })
									: null
								return (
									<Table.Row
										key={pool.key}
										{...rowLink(`/address/${pool.address}`)}
									>
										<Table.Cell>
											<Link
												to="/address/$address"
												params={{ address: pool.address }}
												title={pool.address}
												{...styles.link()}
											>
												<span {...styles.strong()}>
													{pool.base.symbol}
													<span {...styles.muted()}> / </span>
													{pool.quote.symbol}
												</span>
												<Table.Subtitle>
													<span {...styles.mono()}>
														{pool.version} · {formatHex(pool.address)}
													</span>
												</Table.Subtitle>
											</Link>
										</Table.Cell>
										<Table.Cell justify="end" numeric>
											{pool.price === null ? (
												<span {...styles.muted()}>—</span>
											) : (
												<span {...styles.nowrap()}>
													{price.format(pool.price)}{' '}
													<span {...styles.muted()}>{pool.quote.symbol}</span>
												</span>
											)}
										</Table.Cell>
										<Table.Cell justify="end" numeric>
											<Inventory pool={pool} />
										</Table.Cell>
										<Table.Cell justify="end" numeric>
											<Volume
												loading={trades.isPending}
												failed={volumeFailed}
												value={poolVolume?.day}
											/>
										</Table.Cell>
										<Table.Cell justify="end" numeric>
											<Volume
												loading={trades.isPending}
												failed={volumeFailed}
												value={poolVolume?.month}
											/>
										</Table.Cell>
										<Table.Cell justify="start">
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

function Inventory(props: { pool: PropAmmPool }): React.JSX.Element {
	const { base, quote, baseBalance, quoteBalance, inventory } = props.pool
	const balance = (value: number | null, symbol: string) => (
		<span {...styles.nowrap()}>
			{value === null ? '—' : amount.format(value)}{' '}
			<span {...styles.muted()}>{symbol}</span>
		</span>
	)
	return (
		<span>
			{balance(baseBalance, base.symbol)}
			<br />
			{balance(quoteBalance, quote.symbol)}
			{inventory !== null && (
				<Table.Subtitle>{usd(inventory)} total</Table.Subtitle>
			)}
		</span>
	)
}

function Volume(props: {
	loading: boolean
	failed: boolean
	value: number | undefined
}): React.JSX.Element {
	if (props.loading)
		return (
			<Skeleton>
				<span>$0.00M</span>
			</Skeleton>
		)
	if (props.failed || props.value === undefined || props.value <= 0)
		return <span {...styles.muted()}>—</span>
	return <span>{usd(props.value)}</span>
}

function State(props: { pool: PropAmmPool }): React.JSX.Element {
	const { status, detail } = propAmmStatus(props.pool.state)
	return (
		<span {...styles.nowrap()}>
			<StatusIndicator intent={statusIntent[status]}>
				{statusLabels[status]}
			</StatusIndicator>
			{detail && <Table.Subtitle>{detail}</Table.Subtitle>}
		</span>
	)
}
