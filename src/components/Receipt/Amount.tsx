import { useQuery } from '@tanstack/react-query'
import type { Address } from 'ox'
import { Value } from 'ox'
import { Actions } from 'tempo.ts/wagmi'
import { formatAmount } from '#formatting.ts'
import { config } from '#wagmi.config.ts'

export function Amount(props: Amount.Props) {
	const { value, token, decimals: decimals_ } = props

	const { data: metadata } = useQuery({
		queryKey: ['token-metadata', token],
		queryFn: () => Actions.token.getMetadata(config, { token }),
		enabled: decimals_ === undefined,
	})
	const decimals = decimals_ ?? metadata?.decimals
	const rawFormatted =
		decimals === undefined ? '…' : Value.format(value, decimals)
	const formatted = rawFormatted === '…' ? '…' : formatAmount(rawFormatted)

	return (
		<span className="items-end whitespace-nowrap">
			{formatted}{' '}
			<span className="text-base-content-positive">{metadata?.symbol}</span>
		</span>
	)
}

export namespace Amount {
	export interface Props {
		value: bigint
		token: Address.Address
		decimals?: number
	}
}
