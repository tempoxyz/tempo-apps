import { Link } from '@tanstack/react-router'
import { type Address, Value } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { Hooks } from 'tempo.ts/wagmi'
import { useReadContracts } from 'wagmi'
import { TokenIcon } from '#comps/TokenIcon.tsx'
import { isTip20Address } from '#lib/domain/tip20.ts'
import { PriceFormatter } from '#lib/formatting.ts'

export function Amount(props: Amount.Props) {
	const { value, token, decimals, symbol } = props

	const isTip20 = isTip20Address(token)

	const { data: metadata } = Hooks.token.useGetMetadata({
		token,
		query: {
			enabled: decimals === undefined && isTip20,
		},
	})

	const { data: nonTip20Data } = useReadContracts({
		contracts: [
			{ address: token, abi: Abis.tip20, functionName: 'decimals' },
			{ address: token, abi: Abis.tip20, functionName: 'symbol' },
		],
		query: {
			enabled: (decimals === undefined || symbol === undefined) && !isTip20,
		},
	})

	const nonTip20Decimals = nonTip20Data?.[0]?.result
	const nonTip20Symbol = nonTip20Data?.[1]?.result

	const decimals_ = decimals ?? metadata?.decimals ?? nonTip20Decimals
	const symbol_ = symbol ?? metadata?.symbol ?? nonTip20Symbol

	const isLoading = decimals_ === undefined

	const rawFormatted = isLoading ? '…' : Value.format(value, decimals_)
	const formatted = isLoading ? '…' : PriceFormatter.formatAmount(rawFormatted)

	return (
		<span className="inline-flex items-center gap-1 whitespace-nowrap">
			{formatted} <TokenIcon address={token} name={symbol_} />
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
