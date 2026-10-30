import { formatUnits } from 'viem'
import { cx } from '#lib/css'
import { PriceFormatter } from '#lib/formatting'

export function AmountCell(props: {
	value: bigint
	decimals?: number
	symbol?: string
}) {
	const { value, decimals = 18, symbol } = props
	const formatted = PriceFormatter.formatAmount(formatUnits(value, decimals))
	return (
		<span className="label-12 text-primary">
			{formatted} {symbol}
		</span>
	)
}

/**
 * Directional transfer amount: outgoing renders red with a minus, incoming
 * green. Clicking toggles between currency display (`$1.23`, via
 * `Intl.NumberFormat` when the token has an ISO currency) and the token
 * amount (`1.23 USDC`).
 */
export function TransferAmountCell(props: {
	value: bigint
	/** Colors the amount (out = red with minus, in = green); omit for neutral. */
	direction?: 'in' | 'out' | 'self' | undefined
	display: 'currency' | 'token'
	onToggleDisplay: () => void
	decimals?: number | undefined
	symbol?: string | undefined
	currency?: string | undefined
	/** The amount's worth in another unit (Earn shares in their asset). */
	valuation?: { value: string; currency: string; decimals: number } | undefined
}) {
	const {
		value,
		direction,
		display,
		onToggleDisplay,
		decimals = 18,
		symbol,
		currency,
	} = props

	const amount = formatUnits(value, decimals)
	const currencyFormatted = (() => {
		const { valuation } = props
		if (valuation)
			try {
				return new Intl.NumberFormat(undefined, {
					style: 'currency',
					currency: valuation.currency,
					currencyDisplay: 'narrowSymbol',
					maximumSignificantDigits: 4,
				}).format(
					Number(formatUnits(BigInt(valuation.value), valuation.decimals)),
				)
			} catch {
				return undefined
			}
		if (!currency) return undefined
		try {
			return new Intl.NumberFormat(undefined, {
				style: 'currency',
				currency,
				// `$1.23`, not `US$1.23`, in non-US locales.
				currencyDisplay: 'narrowSymbol',
			}).format(Number(amount))
		} catch {
			// Not an ISO currency code — fall back to the token amount.
			return undefined
		}
	})()
	const tokenFormatted =
		`${PriceFormatter.formatAmount(amount)} ${symbol ?? ''}`.trim()
	const text =
		display === 'currency' && currencyFormatted
			? currencyFormatted
			: tokenFormatted

	return (
		<button
			type="button"
			title="Toggle currency/token amounts"
			className={cx(
				'label-12 cursor-pointer tabular-nums whitespace-nowrap',
				direction === 'out'
					? 'text-negative'
					: direction === 'in'
						? 'text-positive'
						: 'text-primary',
			)}
			onClick={(event) => {
				event.preventDefault()
				event.stopPropagation()
				onToggleDisplay()
			}}
		>
			{direction === 'out' ? `-${text}` : text}
		</button>
	)
}

export function BalanceCell(props: { balance: string; decimals?: number }) {
	const { balance, decimals = 18 } = props
	const formatted = PriceFormatter.formatAmount(
		formatUnits(BigInt(balance), decimals),
	)
	return <span className="label-12 text-primary">{formatted}</span>
}
