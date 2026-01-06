import { Link } from '@tanstack/react-router'
import { type Address, Value } from 'ox'
import { maxUint256 } from 'viem'
import { Abis } from 'viem/tempo'
import { useReadContracts } from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { TokenIcon } from '#comps/TokenIcon.tsx'
import { ellipsis } from '#lib/chars'
import { isTip20Address } from '#lib/domain/tip20.ts'
import { PriceFormatter } from '#lib/formatting.ts'

export function Amount(props: Amount.Props) {
	const {
		value,
		token,
		decimals,
		symbol,
		before,
		after,
		prefix,
		suffix,
		short,
		maxWidth,
		infinite,
	} = props

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

	if (isLoading) return <span>{ellipsis}</span>

	return (
		<Amount.Base
			value={value}
			decimals={decimals_}
			before={before}
			after={
				<>
					<TokenIcon address={token} name={symbol_} className="shrink-0" />
					<Link
						className="text-base-content-positive press-down inline-flex shrink-0"
						params={{ address: token }}
						title={token}
						to={isTip20Address(token) ? '/token/$address' : '/address/$address'}
					>
						{symbol_}
					</Link>
					{after}
				</>
			}
			prefix={prefix}
			suffix={suffix}
			short={short}
			maxWidth={maxWidth}
			infinite={infinite}
		/>
	)
}

export namespace Amount {
	export interface Props extends Omit<Base.Props, 'decimals'> {
		token: Address.Address
		decimals?: number
		symbol?: string
	}

	export function Base(props: Base.Props) {
		const {
			value,
			decimals,
			before,
			after,
			prefix,
			suffix,
			short,
			maxWidth = 24,
			infinite = true,
		} = props

		const precisionLossTolerance = 10n ** 64n
		const isInfinite =
			infinite !== false &&
			value > (maxUint256 / precisionLossTolerance) * precisionLossTolerance

		if (isInfinite && infinite === null) return null

		if (isInfinite)
			return (
				<span className="inline-flex items-center gap-1 min-w-0">
					{before}
					{infinite === true ? 'infinite' : infinite}
					{after}
				</span>
			)

		const rawFormatted = Value.format(value, decimals)
		const fullFormatted = PriceFormatter.formatAmount(rawFormatted)
		const formatted = short
			? PriceFormatter.formatAmountShort(rawFormatted)
			: fullFormatted

		return (
			<span className="inline-flex items-center gap-1 min-w-0">
				{before}
				<span
					className="overflow-hidden text-ellipsis whitespace-nowrap min-w-0"
					style={{ maxWidth: `${maxWidth}ch` }}
					title={`${prefix ?? ''}${fullFormatted}${suffix ?? ''}`}
				>
					{`${prefix ?? ''}${formatted}${suffix ?? ''}`}
				</span>
				{after}
			</span>
		)
	}

	export namespace Base {
		export interface Props {
			after?: React.ReactNode
			before?: React.ReactNode
			decimals: number
			/**
			 * Controls infinite value detection (uint256 max):
			 * - `true` (default): detect and show "infinite"
			 * - `false`: no detection, show the raw value
			 * - `ReactNode`: detect and show custom label
			 * - `null`: detect and render nothing
			 */
			infinite?: boolean | null | React.ReactNode
			maxWidth?: number
			prefix?: string
			short?: boolean
			suffix?: string
			value: bigint
		}
	}
}
