import { Link } from '@tanstack/react-router'
import { style, Amount as TdsAmount, Token } from '@tempoxyz/ds'
import type { Address } from 'ox'
import * as Value from 'ox/Value'
import type * as React from 'react'
import { maxUint256 } from 'viem'
import { useReadContracts } from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { cx } from 'zyzz'
import { Abis } from '#lib/abis'
import { ellipsis } from '#lib/chars'
import { isTip20Address } from '#lib/domain/tip20'
import { linkHover } from '#styles/explorer'

/**
 * A token amount: the token's icon and TDS `Amount`, linking to the token.
 * Reads the token's decimals and symbol when they aren't passed.
 */
export function Amount(props: Amount.Props): React.JSX.Element | null {
	const { decimals, symbol, token, value: rawValue, ...rest } = props

	const value = typeof rawValue === 'bigint' ? rawValue : BigInt(rawValue)
	const isTip20 = isTip20Address(token)

	const { data: metadata } = Hooks.token.useGetMetadata({
		token,
		query: { enabled: decimals === undefined && isTip20 },
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

	const decimals_ = decimals ?? metadata?.decimals ?? nonTip20Data?.[0]?.result
	const symbol_ = symbol ?? metadata?.symbol ?? nonTip20Data?.[1]?.result

	if (decimals_ === undefined)
		return <span {...styles.pending()}>{ellipsis}</span>
	if (rest.infinite === null && Amount.isInfinite(value)) return null

	return (
		<Link
			params={{ address: token }}
			title={token}
			to={isTip20 ? '/token/$address' : '/address/$address'}
			{...cx(styles.token(), linkHover())}
		>
			{/* In dollars the icon stands alone, so it names the token. */}
			<Token
				address={token}
				alt={rest.prefix === '$' ? symbol_ : undefined}
				size="small"
			/>
			<Amount.Base
				{...rest}
				decimals={decimals_}
				symbol={symbol_}
				value={value}
			/>
		</Link>
	)
}

export namespace Amount {
	export type Props = Omit<Base.Props, 'decimals' | 'symbol' | 'value'> & {
		/** The amount in base units. */
		value: bigint | string
		token: Address.Address
		decimals?: number | undefined
		symbol?: string | undefined
	}

	// Amounts this close to the uint256 maximum are unlimited approvals.
	const precisionLossTolerance = 10n ** 64n
	const infiniteThreshold =
		(maxUint256 / precisionLossTolerance) * precisionLossTolerance

	export function isInfinite(value: bigint): boolean {
		return value > infiniteThreshold
	}

	/**
	 * An amount in base units in TDS `Amount`: in US dollars with `prefix="$"`,
	 * otherwise followed by `symbol`.
	 */
	export function Base(props: Base.Props): React.JSX.Element | null {
		const {
			decimals,
			infinite = true,
			prefix,
			short,
			shortMaximumFractionDigits = 2,
			symbol,
			value,
		} = props

		if (infinite !== false && isInfinite(value)) {
			if (infinite === null) return null
			return (
				<span>
					{infinite === true ? 'infinite' : infinite}
					{symbol && ` ${symbol}`}
				</span>
			)
		}

		const decimal = Value.format(value, decimals)
		if (prefix === '$')
			return <TdsAmount currency="USD" precise value={decimal} />
		return (
			<TdsAmount
				maxDecimals={short ? shortMaximumFractionDigits : undefined}
				symbol={symbol}
				value={decimal}
			/>
		)
	}

	export namespace Base {
		export type Props = {
			decimals: number
			/**
			 * Unlimited amounts (near the uint256 maximum):
			 * - `true` (default): show "infinite"
			 * - `false`: show the number
			 * - `ReactNode`: show this label
			 * - `null`: render nothing
			 */
			infinite?: React.ReactNode
			/** `$` shows the amount in US dollars. */
			prefix?: '$' | undefined
			/** Caps a token amount at `shortMaximumFractionDigits` (2) decimals. */
			short?: boolean | undefined
			shortMaximumFractionDigits?: number | undefined
			/** The token symbol after the number. */
			symbol?: string | undefined
			value: bigint
		}
	}
}

namespace styles {
	export const token = style({
		alignItems: 'center',
		color: 'foreground',
		display: 'inline-flex',
		gap: '4',
		minWidth: '0 !custom',
		textDecorationLine: 'none',
	})

	export const pending = style({ color: 'gray.900' })
}
