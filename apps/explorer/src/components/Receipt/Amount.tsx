import { type Address, Value } from 'ox'
import { Hooks } from 'tempo.ts/wagmi'
import { PriceFormatter } from '#lib/formatting.ts'

export function Amount(props: Amount.Props) {
	const { value, token, decimals, symbol } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token,
		query: {
			enabled: decimals === undefined,
		},
	})

	const decimals_ = decimals ?? metadata?.decimals
	const symbol_ = symbol ?? metadata?.symbol

	const rawFormatted =
		decimals_ === undefined ? '…' : Value.format(value, decimals_)
	const formatted =
		rawFormatted === '…' ? '…' : PriceFormatter.formatAmount(rawFormatted)

	return (
		<span className="items-end whitespace-nowrap">
			{formatted} <span className="text-base-content-positive">{symbol_}</span>
		</span>
	)
}

export namespace Amount {
	export interface Props {
		value: bigint
		token: Address.Address
		decimals?: number
		symbol?: string
	}
}
