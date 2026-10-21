import { Link } from '@tanstack/react-router'
import { Amount, Empty, style, Token } from '@tempoxyz/ds'
import type { Address as OxAddress } from 'ox'
import * as Value from 'ox/Value'
import { cx } from 'zyzz'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { getAccountTag } from '#lib/account'
import { isTip20Address } from '#lib/domain/tip20'
import {
	type BalanceChangesData,
	LIMIT,
	type TokenMetadata,
} from '#lib/queries/balance-changes'
import { link, linkHover } from '#styles/explorer'

export function TxBalanceChanges(
	props: TxBalanceChanges.Props,
): React.JSX.Element {
	const { data, loading = false, page } = props

	const cols: DataGrid.Column[] = [
		{ label: 'Address', align: 'start', width: '2fr' },
		{ label: 'Token', align: 'start', width: '1fr' },
		{ label: 'Before', align: 'end', width: '2fr' },
		{ label: 'After', align: 'end', width: '2fr' },
		{ label: 'Change', align: 'end', width: '2fr' },
	]

	if (data.total === 0 && !loading)
		return (
			<Empty.Root>
				<Empty.Title>No balance changes</Empty.Title>
				<Empty.Description>
					This transaction moved no token balances.
				</Empty.Description>
			</Empty.Root>
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
							<Address
								key="addr"
								address={change.address}
								label={getAccountTag(change.address)?.label}
							/>,
							<TxBalanceChanges.TokenSymbol
								key="token"
								token={change.token}
								metadata={metadata}
							/>,
							<TxBalanceChanges.Balance
								key="before"
								value={change.balanceBefore}
								metadata={metadata}
							/>,
							<TxBalanceChanges.Balance
								key="after"
								value={change.balanceAfter}
								metadata={metadata}
							/>,
							<TxBalanceChanges.Balance
								key="diff"
								change
								value={change.diff}
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
			emptyState="No balance changes"
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

	/** The token's icon and symbol, linking to its page. */
	export function TokenSymbol(props: TokenSymbol.Props): React.JSX.Element {
		const { token, metadata } = props

		return (
			<Link
				{...cx(styles.token(), link(), linkHover())}
				params={{ address: token }}
				title={token}
				to={isTip20Address(token) ? '/token/$address' : '/address/$address'}
			>
				<Token address={token} size="small" />
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

	/**
	 * A balance in base units, as a TDS `Amount` in the token's symbol. With
	 * `change`, it is a signed difference: "+" for money in, "−" for money out.
	 */
	export function Balance(props: Balance.Props): React.JSX.Element {
		const { change = false, metadata, value } = props

		if (!metadata) return <span>…</span>

		let units: bigint
		try {
			units = BigInt(value)
		} catch {
			return <span {...styles.secondary()}>Unreadable value</span>
		}

		const sign = !change
			? undefined
			: units > 0n
				? '+'
				: units < 0n
					? '−'
					: undefined

		return (
			<Amount
				align="right"
				sign={sign}
				symbol={metadata.symbol}
				value={Value.format(units < 0n ? -units : units, metadata.decimals)}
				{...cx(styles.amount(), !change && styles.secondary())}
			/>
		)
	}

	export namespace Balance {
		export interface Props {
			/** Shows the value as a signed change. */
			change?: boolean | undefined
			metadata: TokenMetadata | undefined
			/** Base units, as a decimal integer string. */
			value: string
		}
	}
}

namespace styles {
	export const token = style({
		alignItems: 'center',
		display: 'inline-flex',
		flexShrink: '0 !custom',
		gap: '4',
	})

	// Balances before and after read secondary to the change.
	export const secondary = style({ color: 'gray.900' })

	// Amount leaves wrapping unset; long balances break instead of overflowing.
	export const amount = style({ minWidth: '0', overflowWrap: 'anywhere' })
}
