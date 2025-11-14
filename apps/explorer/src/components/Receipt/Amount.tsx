import { ClientOnly } from '@tanstack/react-router'
import { type Address, Value } from 'ox'
import { Hooks } from 'tempo.ts/wagmi'
import { PriceFormatter } from '#lib/formatting.ts'

export function Amount(props: Amount.Props) {
	const { value, token, decimals: decimals_ } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token,
		query: {
			enabled: decimals_ === undefined,
		},
	})
	const decimals = decimals_ ?? metadata?.decimals
	const rawFormatted =
		decimals === undefined ? '…' : Value.format(value, decimals)
	const formatted =
		rawFormatted === '…' ? '…' : PriceFormatter.formatAmount(rawFormatted)

	return (
		<ClientOnly fallback={<span>…</span>}>
			<span className="items-end whitespace-nowrap">
				{formatted}{' '}
				<span className="text-base-content-positive">{metadata?.symbol}</span>
			</span>
		</ClientOnly>
	)
}

export namespace Amount {
	export interface Props {
		value: bigint
		token: Address.Address
		decimals?: number
	}
}
