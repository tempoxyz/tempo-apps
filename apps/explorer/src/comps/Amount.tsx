import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Address } from 'ox'
import * as Value from 'ox/Value'
import { maxUint256 } from 'viem'
import { Abis } from '#lib/abis'
import { useReadContracts } from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { cx } from 'zyzz'
import { TokenIcon } from '#comps/TokenIcon.tsx'
import { ellipsis } from '#lib/chars'
import { isTip20Address } from '#lib/domain/tip20.ts'
import { PriceFormatter } from '#lib/formatting.ts'
import { link, linkHover, pressDown } from '#styles/explorer'

export function Amount(props: Amount.Props) {
	const {
		value: rawValue,
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

	const value = typeof rawValue === 'bigint' ? rawValue : BigInt(rawValue)
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
					<TokenIcon address={token} />
					<Link
						{...cx(styles.symbol(), link(), linkHover(), pressDown())}
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
	export interface Props extends Omit<Base.Props, 'decimals' | 'value'> {
		value: bigint | string
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
			shortMaximumFractionDigits,
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
				<span {...styles.root()}>
					{before}
					{infinite === true ? 'infinite' : infinite}
					{after}
				</span>
			)

		const rawFormatted = Value.format(value, decimals)
		const fullFormatted = PriceFormatter.formatAmount(rawFormatted)
		const numericValue = Number(rawFormatted)
		const isCurrencySmall =
			prefix === '$' && numericValue > 0 && numericValue < 0.01
		const formatted = isCurrencySmall
			? '<0.01'
			: short
				? PriceFormatter.formatAmountShort(rawFormatted, {
						maximumFractionDigits: shortMaximumFractionDigits,
					})
				: fullFormatted
		const isSmall = formatted.startsWith('<')

		return (
			<span {...styles.root()}>
				{before}
				<span
					{...cx(
						styles.value({ style: { maxWidth: `${maxWidth}ch` } }),
						isSmall && styles.small(),
					)}
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
			shortMaximumFractionDigits?: number
			suffix?: string
			value: bigint
		}
	}
}

namespace styles {
	export const symbol = style({
		display: 'inline-flex',
		flexShrink: '0 !custom',
	})

	export const root = style({
		alignItems: 'center',
		display: 'inline-flex',
		gap: '4',
		minWidth: '0 !custom',
	})

	export const value = style({
		minWidth: '0 !custom',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	})

	export const small = style({ color: 'content.secondary' })
}
