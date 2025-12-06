import { formatUnits } from 'viem'
import { PriceFormatter } from '#lib/formatting'

export function AmountCell(props: {
	value: bigint
	decimals?: number
	symbol?: string
}) {
	const { value, decimals = 18, symbol } = props
	const formatted = PriceFormatter.formatAmount(formatUnits(value, decimals))
	return (
		<span className="text-[12px] text-primary">
			{formatted} {symbol}
		</span>
	)
}

export function BalanceCell(props: { balance: string; decimals?: number }) {
	const { balance, decimals = 18 } = props
	const formatted = PriceFormatter.formatAmount(
		formatUnits(BigInt(balance), decimals),
	)
	return <span className="text-[12px] text-primary">{formatted}</span>
}
