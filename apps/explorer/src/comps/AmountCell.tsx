import { Amount } from '@tempoxyz/ds'
import type * as React from 'react'
import { formatUnits } from 'viem'

/** A transfer's token amount, signed `+` when incoming and `−` when outgoing. */
export function TransferAmountCell(
	props: TransferAmountCell.Props,
): React.JSX.Element {
	const { decimals = 18, direction, symbol, value } = props
	return (
		<Amount
			align="right"
			sign={direction === 'in' ? '+' : direction === 'out' ? '−' : undefined}
			symbol={symbol}
			value={formatUnits(value, decimals)}
		/>
	)
}

export declare namespace TransferAmountCell {
	type Props = {
		/** The amount in base units. */
		value: bigint
		/** The direction relative to the viewed account; omit for neutral. */
		direction?: 'in' | 'out' | 'self' | undefined
		decimals?: number | undefined
		symbol?: string | undefined
	}
}

/** A holder's token balance. */
export function BalanceCell(props: BalanceCell.Props): React.JSX.Element {
	const { balance, decimals = 18, symbol } = props
	return (
		<Amount
			align="right"
			symbol={symbol}
			value={formatUnits(BigInt(balance), decimals)}
		/>
	)
}

export declare namespace BalanceCell {
	type Props = {
		/** The balance in base units. */
		balance: string
		decimals?: number | undefined
		symbol?: string | undefined
	}
}
