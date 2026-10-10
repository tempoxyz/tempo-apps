import { Link } from '@tanstack/react-router'
import { style, variants } from '@tempoxyz/ds/platform'
import type { Address as OxAddress } from 'ox'
import * as Value from 'ox/Value'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { TokenIcon } from '#comps/TokenIcon'
import { Empty } from '#comps/ui/Empty'
import { isTip20Address } from '#lib/domain/tip20'
import { PriceFormatter } from '#lib/formatting'
import {
	type BalanceChangesData,
	LIMIT,
	type TokenMetadata,
} from '#lib/queries/balance-changes'
import { link, linkHover, pressDown, truncate } from '#styles/explorer'

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
		return <Empty compact title="No balance changes for this transaction." />

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
				{...cx(styles.tokenLink(), link(), linkHover(), pressDown())}
				params={{ address: token }}
				title={token}
				to={isTip20 ? '/token/$address' : '/address/$address'}
			>
				<TokenIcon address={token} />
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

		return (
			<Diff
				value={diff}
				formatted={PriceFormatter.formatAmount(
					Value.format(diff, metadata.decimals),
				)}
			/>
		)
	}

	export namespace DiffCell {
		export interface Props {
			diff: string
			metadata: TokenMetadata | undefined
		}
	}

	/**
	 * A signed balance change. Direction is carried by the sign and a coloured
	 * dot; the text stays `content.primary`, since the status colours fail
	 * contrast as text in light mode.
	 */
	export function Diff(props: Diff.Props): React.JSX.Element {
		const { formatted, value } = props
		const tone = value > 0n ? 'positive' : value < 0n ? 'negative' : 'neutral'

		return (
			<span {...styles.diff()} title={formatted}>
				<span aria-hidden="true" {...styles.diffDot({ tone })} />
				<span {...truncate()}>
					{value > 0n ? '+' : ''}
					{formatted}
				</span>
			</span>
		)
	}

	export namespace Diff {
		export interface Props {
			/** Formatted amount, already signed when negative. */
			formatted: string
			value: bigint
		}
	}
}

namespace styles {
	export const tokenLink = style({
		alignItems: 'center',
		display: 'inline-flex',
		flexShrink: '0 !custom',
		gap: '4',
	})

	export const invalid = style({ color: 'content.secondary' })

	export const amount = style({
		fontVariantNumeric: 'tabular-nums',
		minWidth: '0 !custom',
	})

	export const balance = style({ color: 'content.secondary' })

	export const diff = style({
		alignItems: 'center',
		color: 'content.primary',
		columnGap: '8',
		display: 'inline-flex',
		fontVariantNumeric: 'tabular-nums',
		maxWidth: '100% !custom',
		minWidth: '0 !custom',
	})

	// StatusIndicator's dot, without its label styling.
	export const diffDot = variants({
		base: {
			borderRadius: 'full',
			flexShrink: '0 !custom',
			height: '8',
			width: '8',
		},
		defaultVariants: { tone: 'neutral' },
		variants: {
			tone: {
				negative: { backgroundColor: 'content.negative' },
				neutral: { display: 'none' },
				positive: { backgroundColor: 'content.positive' },
			},
		},
	})
}
