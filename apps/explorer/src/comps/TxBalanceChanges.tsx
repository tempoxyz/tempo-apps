import { Link } from '@tanstack/react-router'
import type { Address as OxAddress } from 'ox'
import { Value } from 'ox'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { TokenIcon } from '#comps/TokenIcon'
import { cx } from '#cva.config'
import { isTip20Address } from '#lib/domain/tip20'
import { PriceFormatter } from '#lib/formatting'
import {
	type BalanceChangesData,
	LIMIT,
	type TokenMetadata,
} from '#lib/queries/balance-changes'

export function TxBalanceChanges(props: TxBalanceChanges.Props) {
	const { data, page } = props

	if (data.total === 0)
		return (
			<div className="px-[18px] py-[24px] text-[13px] text-tertiary text-center">
				No balance changes for this transaction.
			</div>
		)

	const cols: DataGrid.Column[] = [
		{ label: 'Address', align: 'start', width: '2fr' },
		{ label: 'Token', align: 'start', width: '1fr', minWidth: 120 },
		{ label: 'Before', align: 'end', width: '2fr', minWidth: 160 },
		{ label: 'After', align: 'end', width: '2fr', minWidth: 160 },
		{ label: 'Change', align: 'end', width: '2fr', minWidth: 160 },
	]

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
			pagination="simple"
		/>
	)
}

export namespace TxBalanceChanges {
	export interface Props {
		data: BalanceChangesData
		page: number
	}

	export function TokenSymbol(props: TokenSymbol.Props) {
		const { token, metadata } = props
		const isTip20 = isTip20Address(token)

		return (
			<Link
				className="text-base-content-positive press-down inline-flex items-center gap-1 font-mono"
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
			return <span className="text-tertiary">Invalid</span>
		}

		const raw = Value.format(value, metadata.decimals)
		const formatted = PriceFormatter.formatAmount(raw)

		return <span className="text-secondary font-mono">{formatted}</span>
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
			return <span className="text-tertiary">Invalid</span>
		}

		const isPositive = diff > 0n
		const raw = Value.format(diff, metadata.decimals)
		const formatted = PriceFormatter.formatAmount(raw)

		return (
			<span
				className={cx(
					'font-mono',
					isPositive ? 'text-base-content-positive' : undefined,
				)}
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
