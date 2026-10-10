import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Address as OxAddress } from 'ox'
import * as Value from 'ox/Value'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { TokenIcon } from '#comps/TokenIcon'
import { isTip20Address } from '#lib/domain/tip20'
import { PriceFormatter } from '#lib/formatting'
import {
	type BalanceChangesData,
	LIMIT,
	type TokenMetadata,
} from '#lib/queries/balance-changes'
import { pressDown, truncate } from '#styles/explorer'

export function TxBalanceChanges(props: TxBalanceChanges.Props) {
	const { data, loading = false, page } = props

	const cols: DataGrid.Column[] = [
		{ label: 'Address', align: 'start', width: '2fr', minWidth: 140 },
		{ label: 'Token', align: 'start', width: '1fr', minWidth: 120 },
		{ label: 'Before', align: 'end', width: '2fr', minWidth: 160 },
		{ label: 'After', align: 'end', width: '2fr', minWidth: 160 },
		{ label: 'Change', align: 'end', width: '2fr', minWidth: 160 },
	]

	if (data.total === 0 && !loading)
		return (
			<div {...styles.empty()}>No balance changes for this transaction.</div>
		)

	return (
		<DataGrid
			columns={{ stacked: cols, tabs: cols }}
			items={() =>
				data.changes.map((change) => {
					const metadata = data.tokenMetadata[change.token]
					return {
						link: {
							href: `/token/${change.token}?a=${change.address}`,
							title: `View ${change.token} transfers for ${change.address}`,
						},
						cells: [
							<Address key="addr" address={change.address} />,
							<TxBalanceChanges.TokenSymbol
								key="token"
								token={change.token}
								metadata={metadata}
							/>,
							<TxBalanceChanges.BalanceCell
								key="before"
								value={change.balanceBefore}
								metadata={metadata}
							/>,
							<TxBalanceChanges.BalanceCell
								key="after"
								value={change.balanceAfter}
								metadata={metadata}
							/>,
							<TxBalanceChanges.DiffCell
								key="diff"
								diff={change.diff}
								metadata={metadata}
							/>,
						],
					}
				})
			}
			totalItems={data.total}
			page={page}
			itemsLabel="changes"
			itemsPerPage={LIMIT}
			emptyState="No balance changes detected."
			loading={loading}
			pagination="simple"
			showSimpleCount={false}
		/>
	)
}

export namespace TxBalanceChanges {
	export interface Props {
		data: BalanceChangesData
		loading?: boolean | undefined
		page: number
	}

	export function TokenSymbol(props: TokenSymbol.Props) {
		const { token, metadata } = props
		const isTip20 = isTip20Address(token)

		return (
			<Link
				{...cx(styles.tokenLink(), pressDown())}
				params={{ address: token }}
				title={token}
				to={isTip20 ? '/token/$address' : '/address/$address'}
			>
				<TokenIcon address={token} name={metadata?.symbol} />
				{metadata?.symbol ?? '…'}
			</Link>
		)
	}

	export namespace TokenSymbol {
		export interface Props {
			token: OxAddress.Address
			metadata: TokenMetadata | undefined
		}
	}

	export function BalanceCell(props: BalanceCell.Props) {
		const { value: valueStr, metadata } = props

		if (!metadata) return <span>…</span>

		let value: bigint
		try {
			value = BigInt(valueStr)
		} catch {
			return <span {...styles.invalid()}>Invalid</span>
		}

		const raw = Value.format(value, metadata.decimals)
		const formatted = PriceFormatter.formatAmount(raw)

		return (
			<span
				{...cx(styles.amount(), styles.balance(), truncate())}
				title={formatted}
			>
				{formatted}
			</span>
		)
	}

	export namespace BalanceCell {
		export interface Props {
			value: string
			metadata: TokenMetadata | undefined
		}
	}

	export function DiffCell(props: DiffCell.Props) {
		const { diff: diffStr, metadata } = props

		if (!metadata) return <span>…</span>

		let diff: bigint
		try {
			diff = BigInt(diffStr)
		} catch {
			return <span {...styles.invalid()}>Invalid</span>
		}

		const isPositive = diff > 0n
		const raw = Value.format(diff, metadata.decimals)
		const formatted = PriceFormatter.formatAmount(raw)

		return (
			<span
				{...cx(
					styles.amount(),
					truncate(),
					isPositive && styles.positive(),
					diff < 0n && styles.negative(),
				)}
				title={formatted}
			>
				{formatted}
			</span>
		)
	}

	export namespace DiffCell {
		export interface Props {
			diff: string
			metadata: TokenMetadata | undefined
		}
	}
}

namespace styles {
	export const empty = style({
		color: 'content.tertiary',
		paddingBlock: '24',
		paddingInline: '20',
		textAlign: 'center',
		typography: 'body.b3',
	})

	export const tokenLink = style({
		alignItems: 'center',
		color: 'content.positive',
		display: 'inline-flex',
		fontFamily: 'Pilat, Arial, sans-serif',
		gap: '4',
	})

	export const invalid = style({ color: 'content.tertiary' })

	export const amount = style({
		fontFamily: 'Pilat, Arial, sans-serif',
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0 !custom',
	})

	export const balance = style({ color: 'content.secondary' })

	export const positive = style({ color: 'content.positive' })

	export const negative = style({ color: 'content.negative' })
}
