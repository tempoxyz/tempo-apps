import type { Address } from 'ox'
import { style, variants } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { type Connector, useConnection, useWatchAsset } from 'wagmi'
import { Hooks } from 'wagmi/tempo'
import { cx } from 'zyzz'
import { supportsWatchAsset } from '#lib/wallets'
import { pressDown, pulse, transitionColors } from '#styles/explorer'
import LucideWallet from '~icons/lucide/wallet'

export function AddToWallet(
	props: AddToWallet.Props,
): React.JSX.Element | null {
	const { address, symbol: symbolProp, decimals: decimalsProp, image } = props
	const { connector } = useConnection()

	const { data: onChainMetadata } = Hooks.token.useGetMetadata({
		token: address,
		query: { enabled: symbolProp === undefined || decimalsProp === undefined },
	})

	const symbol = symbolProp ?? onChainMetadata?.symbol
	const decimals = decimalsProp ?? onChainMetadata?.decimals

	const hasMetadata =
		typeof symbol === 'string' &&
		symbol.length > 0 &&
		Number.isInteger(decimals) &&
		(decimals as number) >= 0

	const isSupportedConnector = supportsWatchAsset(connector)

	const { watchAsset, isPending, isSuccess, reset } = useWatchAsset()

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset state when navigating to a different token
	React.useEffect(() => {
		reset()
	}, [address, reset])

	React.useEffect(() => {
		if (!isSuccess) return
		const timeout = setTimeout(() => reset(), 3_000)
		return () => clearTimeout(timeout)
	}, [isSuccess, reset])

	const handleClick = () => {
		if (!hasMetadata) return
		watchAsset({
			type: 'ERC20',
			options: {
				address,
				symbol: symbol as string,
				decimals: decimals as number,
				image,
			},
		})
	}

	if (!isSupportedConnector) return null

	const walletName =
		connector?.name && connector.name !== 'Injected' ? connector.name : 'Wallet'

	const label = isSuccess
		? 'Added!'
		: isPending
			? 'Adding…'
			: `Add ${symbol ?? 'token'} to ${walletName}`

	const state = isSuccess ? 'success' : isPending ? 'busy' : 'idle'

	return (
		<button
			type="button"
			disabled={isPending || isSuccess}
			{...cx(
				styles.action({ state }),
				transitionColors(),
				state === 'idle' && pressDown(),
			)}
			onClick={handleClick}
		>
			<LucideWallet {...styles.icon()} />
			{label}
		</button>
	)
}

export declare namespace AddToWallet {
	type Props = {
		address: Address.Address
		connectors: readonly Connector[]
		symbol?: string | undefined
		decimals?: number | undefined
		image?: string | undefined
	}
}

namespace styles {
	export const action = variants({
		base: {
			alignItems: 'center',
			display: 'flex',
			gap: '8',
			typography: 'body.b3',
			width: '100% !custom',
		},
		defaultVariants: { state: 'idle' },
		variants: {
			state: {
				busy: {
					animation: `${pulse} 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
					color: 'content.secondary',
				},
				current: { color: 'content.tertiary', cursor: 'default' },
				idle: {
					color: 'content.secondary',
					cursor: 'pointer',
					'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
				},
				success: { color: 'content.positive' },
			},
		},
	})

	export const icon = style({
		flexShrink: 0,
		height: '14px !custom',
		width: '14px !custom',
	})
}
