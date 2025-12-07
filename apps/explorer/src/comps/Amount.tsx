import { Link } from '@tanstack/react-router'
import { type Address, Value } from 'ox'
import { Hooks } from 'tempo.ts/wagmi'
import { isTip20Address } from '#lib/domain/tip20.ts'
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
			{formatted}{' '}
			<Link
				className="text-base-content-positive press-down inline-flex"
				params={{ address: token }}
				title={token}
				to={isTip20Address(token) ? '/token/$address' : '/address/$address'}
			>
				{symbol_}
			</Link>
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
