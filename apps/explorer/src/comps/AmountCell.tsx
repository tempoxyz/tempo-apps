import { style, variants } from '@tempoxyz/ds/platform'
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
		<span {...styles.amount()}>
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
			{...styles.transfer({
				direction:
					direction === 'out' || direction === 'in' ? direction : 'neutral',
			})}
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
	return <span {...styles.amount()}>{formatted}</span>
}

namespace styles {
	export const amount = style({
		color: 'content.primary',
		typography: 'body.b3',
	})

	export const transfer = variants({
		base: {
			cursor: 'pointer',
			fontVariantNumeric: 'tabular-nums',
			typography: 'body.b3',
		},
		defaultVariants: { direction: 'neutral' },
		variants: {
			direction: {
				in: { color: 'content.positive' },
				neutral: { color: 'content.primary' },
				out: { color: 'content.negative' },
			},
		},
	})
}
